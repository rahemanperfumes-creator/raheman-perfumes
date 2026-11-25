import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { Icon, GoogleMark } from '@/components/ui/Icon'
import { NAV_TRANSITION } from '@/components/ui/AppLink'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuthStore } from '@/store/authStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useUiStore } from '@/store/uiStore'
import { authService, googleSignInUrl } from '@/services/authService'

const OAUTH_ERRORS = {
  cancelled: 'The Google sign-in was cancelled. Nothing has changed — you can try again whenever you like.',
  not_configured:
    'Google sign-in has not been configured on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend environment.',
  not_allowed: 'That Google account is not on the list allowed to sign in here.',
  unverified:
    'That Google account\'s email address is not verified with Google, so it cannot be used to sign in.',
  no_password:
    'That account was created with Google, so it has no password. Use “Continue with Google” instead.',
  failed: 'Google could not complete that sign-in. Please try again.',
}

export function SignInPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const modeParam = params.get('mode') // 'register', 'forgot', 'verify', or null
  const currentMode = modeParam === 'register' ? 'register' : modeParam === 'forgot' ? 'forgot' : modeParam === 'verify' ? 'verify' : 'signin'

  const signIn = useAuthStore((state) => state.signIn)
  const registerAccount = useAuthStore((state) => state.register)
  const verifyEmailStore = useAuthStore((state) => state.verifyEmail)
  const sendVerificationCodeStore = useAuthStore((state) => state.sendVerificationCode)
  const toast = useUiStore((state) => state.pushToast)

  // Form states
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    identifier: '', // username or email for login/forgot
    password: '',
    phone: '',
    city: '',
  })

  // Verification state
  const [verificationState, setVerificationState] = useState({
    code: '',
    email: '',
  })

  // UI / validation states
  const [error, setError] = useState('')
  const [accountHintCode, setAccountHintCode] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const [googleOffered, setGoogleOffered] = useState(null)

  // Real-time availability checks
  const [usernameCheck, setUsernameCheck] = useState({ status: 'idle', message: '' })
  const [emailCheck, setEmailCheck] = useState({ status: 'idle', message: '' })
  const usernameTimer = useRef(null)
  const emailTimer = useRef(null)

  const requested = params.get('next')
  const next = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/account'

  useDocumentTitle(
    currentMode === 'register'
      ? 'Create Account'
      : currentMode === 'forgot'
      ? 'Forgot Password'
      : currentMode === 'verify'
      ? 'Verify Email'
      : 'Sign In',
  )

  // Handle OAuth query errors
  const errorCode = params.get('error')
  useEffect(() => {
    if (!errorCode) return
    setError(OAUTH_ERRORS[errorCode] ?? OAUTH_ERRORS.failed)
  }, [errorCode])

  // Handle session timeout notices
  const signedOutReason = useAuthStore((state) => state.signedOutReason)
  useEffect(() => {
    if (signedOutReason) setError(signedOutReason)
  }, [signedOutReason])

  // Fetch available sign-in providers
  useEffect(() => {
    let live = true
    authService
      .providers()
      .then((answer) => live && setGoogleOffered(Boolean(answer?.google)))
      .catch(() => live && setGoogleOffered(true))
    return () => {
      live = false
    }
  }, [])

  const setField = (field) => (event) => {
    const value = event.target.value
    if (error) setError('')
    if (accountHintCode) setAccountHintCode('')
    if (successMsg) setSuccessMsg('')
    setForm((current) => ({ ...current, [field]: value }))

    // Trigger debounced live checks during registration
    if (currentMode === 'register') {
      if (field === 'username') {
        const cleaned = value.trim().toLowerCase()
        if (cleaned.length < 3) {
          setUsernameCheck({ status: 'idle', message: '' })
          return
        }
        setUsernameCheck({ status: 'checking', message: 'Checking...' })
        clearTimeout(usernameTimer.current)
        usernameTimer.current = setTimeout(async () => {
          try {
            const res = await authService.checkAvailability({ username: cleaned })
            if (res.usernameAvailable) {
              setUsernameCheck({ status: 'available', message: 'Username available' })
            } else {
              setUsernameCheck({
                status: 'taken',
                message: res.usernameReason || 'Username is already taken',
              })
            }
          } catch {
            setUsernameCheck({ status: 'idle', message: '' })
          }
        }, 400)
      } else if (field === 'email') {
        const cleaned = value.trim().toLowerCase()
        if (!cleaned.includes('@') || cleaned.length < 5) {
          setEmailCheck({ status: 'idle', message: '' })
          return
        }
        setEmailCheck({ status: 'checking', message: 'Checking...' })
        clearTimeout(emailTimer.current)
        emailTimer.current = setTimeout(async () => {
          try {
            const res = await authService.checkAvailability({ email: cleaned })
            if (res.emailAvailable) {
              setEmailCheck({ status: 'available', message: 'Email address available' })
            } else if (res.existingMethod === 'google') {
              setEmailCheck({
                status: 'taken',
                message: 'This email uses Google sign-in — continue with Google or reset password to use the same account.',
              })
            } else {
              setEmailCheck({ status: 'taken', message: 'An account with this email already exists' })
            }
          } catch {
            setEmailCheck({ status: 'idle', message: '' })
          }
        }, 400)
      }
    }
  }

  // Switch modes
  const switchMode = (mode) => {
    setError('')
    setAccountHintCode('')
    setSuccessMsg('')
    const p = new URLSearchParams(params)
    if (mode === 'signin') {
      p.delete('mode')
    } else {
      p.set('mode', mode)
    }
    setParams(p)
  }

  // Sign In submit
  const handleSignIn = async (event) => {
    event.preventDefault()
    if (busyRef.current) return

    busyRef.current = true
    setBusy(true)
    setError('')

    const identifier = (form.identifier || form.email).trim()
    const result = await signIn(identifier, form.password)
    busyRef.current = false
    setBusy(false)

    if (!result.ok) {
      setAccountHintCode(result.code || '')
      return setError(result.message)
    }

    useWishlistStore.getState().push()

    // If user's email is unverified, offer optional skippable verification step
    if (result.requiresEmailVerification) {
      setVerificationState({
        code: '',
        email: result.user?.email || identifier,
      })
      switchMode('verify')
      return
    }

    toast({
      title: 'Signed in',
      description: result.message,
    })
    navigate(next, NAV_TRANSITION)
  }

  // Register submit
  const handleRegister = async (event) => {
    event.preventDefault()
    if (busyRef.current) return
    if (usernameCheck.status === 'taken') {
      return setError('Please choose an available username.')
    }
    if (emailCheck.status === 'taken') {
      return setError('An account with this email already exists.')
    }

    if (!form.phone.trim() || !/^[+]?[\d\s-]{10,15}$/.test(form.phone.trim())) {
      return setError('Please enter a valid 10-digit mobile number.')
    }
    if (!form.city.trim()) {
      return setError('Please enter your city.')
    }

    busyRef.current = true
    setBusy(true)
    setError('')

    const result = await registerAccount({
      name: form.name.trim(),
      username: form.username.trim() || undefined,
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim(),
      city: form.city.trim(),
    })
    busyRef.current = false
    setBusy(false)

    if (!result.ok) {
      setAccountHintCode(result.code || '')
      return setError(result.message)
    }

    useWishlistStore.getState().push()

    // Account created! Present the skippable verification step
    setVerificationState({
      code: '',
      email: form.email.trim(),
    })
    switchMode('verify')
  }

  // Forgot password submit
  const handleForgotPassword = async (event) => {
    event.preventDefault()
    if (busyRef.current) return
    const identifier = (form.identifier || form.email).trim()
    if (!identifier) {
      return setError('Please enter your email address or username.')
    }

    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const res = await authService.forgotPassword(identifier)
      busyRef.current = false
      setBusy(false)
      setSuccessMsg(res.data?.message || 'Password reset link and code have been sent.')
      if (res.data?.email) {
        setVerificationState((prev) => ({
          ...prev,
          email: res.data.email,
        }))
      }
    } catch (err) {
      busyRef.current = false
      setBusy(false)
      setError(err.message || 'Could not process password reset request.')
    }
  }

  // Verify email submit
  const handleVerifyEmail = async (event) => {
    event.preventDefault()
    if (busyRef.current) return
    if (!verificationState.code.trim()) {
      return setError('Enter the 6-digit verification code.')
    }

    busyRef.current = true
    setBusy(true)
    setError('')
    const res = await verifyEmailStore(verificationState.code.trim())
    busyRef.current = false
    setBusy(false)

    if (!res.ok) {
      return setError(res.message)
    }

    toast({
      title: 'Email verified',
      description: 'Your email address has been verified successfully!',
    })
    navigate(next, NAV_TRANSITION)
  }

  // Skip verification step
  const handleSkipVerification = () => {
    toast({
      title: 'Welcome',
      description: 'You can verify your email anytime in your Account settings.',
    })
    navigate(next, NAV_TRANSITION)
  }

  // Resend verification code
  const handleResendCode = async () => {
    if (busyRef.current) return

    busyRef.current = true
    setBusy(true)
    const res = await sendVerificationCodeStore(verificationState.email)
    busyRef.current = false
    setBusy(false)
    if (res.ok) {
      setSuccessMsg('A fresh verification code has been sent.')
    } else {
      setError(res.message)
    }
  }

  const googleHref = googleSignInUrl(next)

  return (
    <div className="min-h-[calc(100vh-80px)] w-full sm:min-h-[calc(100vh-88px)] lg:grid lg:min-h-[calc(100vh-104px)] lg:grid-cols-2">
      {/* Left 50% full-bleed showcase — hidden on smaller screens so only the essential login box shows */}
      <div className="relative hidden overflow-hidden bg-neutral-100 lg:block">
        <img
          src="/signin-atelier.jpg?v=3"
          alt="Raheman Perfumes glass bottle with oud wood, saffron, and jasmine on stone"
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </div>

      {/* Right 50% (100% below lg): essential login / account area */}
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-white px-4 py-8 sm:min-h-[calc(100vh-88px)] sm:px-8 lg:min-h-[calc(100vh-104px)] lg:border-l lg:border-brand-border lg:px-14 lg:py-12">
        <div className="w-full max-w-md rounded-xl border border-brand-border bg-white p-6 shadow-card sm:p-8 lg:max-w-lg lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {/* Header Heading */}
        <h1 className="font-serif text-3xl font-medium text-brand-charcoal lg:text-headline-lg">
          {currentMode === 'register' && 'Create your account'}
          {currentMode === 'signin' && 'Welcome back'}
          {currentMode === 'forgot' && 'Reset your password'}
          {currentMode === 'verify' && 'Verify your email'}
        </h1>

        {/* Global Error Notice */}
        {error && (
          <div
            role="alert"
            className="mt-6 rounded border border-tier-original/30 bg-tier-originalSurface px-4 py-3 text-body-sm text-tier-original"
          >
            <p className="flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
            {(accountHintCode === 'no_password' || accountHintCode === 'google_account_exists') && (
              <div className="mt-3 flex flex-wrap gap-2 pl-6">
                {googleOffered && (
                  <a
                    href={googleHref}
                    className="inline-flex items-center gap-1.5 rounded border border-brand-border bg-white px-3 py-1.5 text-label-xs font-semibold text-brand-charcoal hover:bg-brand-cream"
                  >
                    <GoogleMark className="h-3.5 w-3.5" />
                    Continue with Google
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const prefill = (form.email || form.identifier || '').trim()
                    if (prefill) setForm((current) => ({ ...current, identifier: prefill }))
                    switchMode('forgot')
                  }}
                  className="inline-flex items-center rounded bg-brand-charcoal px-3 py-1.5 text-label-xs font-semibold text-white hover:opacity-90"
                >
                  Set Password via Email Code
                </button>
              </div>
            )}
          </div>
        )}

        {/* Global Success Notice */}
        {successMsg && (
          <p
            role="status"
            className="mt-6 flex items-start gap-2 rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-body-sm text-emerald-800"
          >
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </p>
        )}

        {/* ── Mode 1: SIGN IN ──────────────────────────────────────────────── */}
        {currentMode === 'signin' && (
          <>
            {googleOffered && (
              <>
                <a
                  href={googleHref}
                  className="btn btn-outline btn-lg mt-8 w-full flex items-center justify-center gap-3 border-brand-border hover:bg-brand-cream/40"
                  data-testid="google-signin"
                >
                  <GoogleMark className="h-4 w-4" />
                  <span>Continue with Google</span>
                </a>

                <div className="mt-6 mb-6 flex items-center gap-4" aria-hidden="true">
                  <span className="h-px flex-1 bg-brand-border" />
                  <span className="text-label-sm uppercase tracking-widest text-brand-muted">or</span>
                  <span className="h-px flex-1 bg-brand-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSignIn} className={googleOffered ? 'space-y-5' : 'mt-8 space-y-5'}>
              <Input
                label="Email or Username"
                required
                autoComplete="username"
                value={form.identifier}
                onChange={setField('identifier')}
                placeholder="Enter your email or username"
              />

              <div className="space-y-1">
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={setField('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-8 text-brand-muted hover:text-brand-charcoal text-body-xs font-medium"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-body-xs font-semibold text-brand-goldDark hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-body-sm text-brand-muted text-center">
              New to Raheman Perfumes?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-brand-goldDark underline underline-offset-4 hover:text-brand-charcoal"
              >
                Create an account
              </button>
            </p>
          </>
        )}

        {/* ── Mode 2: REGISTER ────────────────────────────────────────────── */}
        {currentMode === 'register' && (
          <>
            {googleOffered && (
              <>
                <a
                  href={googleHref}
                  className="btn btn-outline btn-lg mt-8 w-full flex items-center justify-center gap-3 border-brand-border hover:bg-brand-cream/40"
                  data-testid="google-signin"
                >
                  <GoogleMark className="h-4 w-4" />
                  <span>Continue with Google</span>
                </a>

                <div className="mt-6 mb-6 flex items-center gap-4" aria-hidden="true">
                  <span className="h-px flex-1 bg-brand-border" />
                  <span className="text-label-sm uppercase tracking-widest text-brand-muted">or</span>
                  <span className="h-px flex-1 bg-brand-border" />
                </div>
              </>
            )}

            <form onSubmit={handleRegister} className={googleOffered ? 'space-y-4' : 'mt-8 space-y-4'}>
              <Input
                label="Full name"
                required
                autoComplete="name"
                value={form.name}
                onChange={setField('name')}
                placeholder="Enter your full name"
              />

              {/* Unique Username Field with Live Availability Indicator */}
              <div className="space-y-1">
                <Input
                  label="Username (unique handle)"
                  required
                  autoComplete="username"
                  value={form.username}
                  onChange={setField('username')}
                  placeholder="Choose a unique username"
                />
                {usernameCheck.status === 'checking' && (
                  <p className="text-body-xs text-brand-muted flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-brand-gold animate-pulse" />
                    Checking handle availability…
                  </p>
                )}
                {usernameCheck.status === 'available' && (
                  <p className="text-body-xs text-emerald-700 flex items-center gap-1">
                    <Icon name="check" className="h-3 w-3" /> {usernameCheck.message}
                  </p>
                )}
                {usernameCheck.status === 'taken' && (
                  <p className="text-body-xs text-tier-original flex items-center gap-1">
                    <Icon name="alert" className="h-3 w-3" /> {usernameCheck.message}
                  </p>
                )}
              </div>

              {/* Unique Email Field with Live Availability Indicator */}
              <div className="space-y-1">
                <Input
                  label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={setField('email')}
                  placeholder="Enter your email address"
                />
                {emailCheck.status === 'checking' && (
                  <p className="text-body-xs text-brand-muted flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-brand-gold animate-pulse" />
                    Verifying email availability…
                  </p>
                )}
                {emailCheck.status === 'available' && (
                  <p className="text-body-xs text-emerald-700 flex items-center gap-1">
                    <Icon name="check" className="h-3 w-3" /> {emailCheck.message}
                  </p>
                )}
                {emailCheck.status === 'taken' && (
                  <p className="text-body-xs text-tier-original flex items-center gap-1">
                    <Icon name="alert" className="h-3 w-3" /> {emailCheck.message}
                  </p>
                )}
              </div>

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  hint="At least 8 characters"
                  value={form.password}
                  onChange={setField('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-8 text-brand-muted hover:text-brand-charcoal text-body-xs font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Mobile *"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={form.phone}
                  onChange={setField('phone')}
                  placeholder="10-digit mobile number"
                />
                <Input
                  label="City *"
                  required
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={setField('city')}
                  placeholder="Enter your city"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                Create account
              </Button>
            </form>

            <p className="mt-6 text-body-sm text-brand-muted text-center">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-semibold text-brand-goldDark underline underline-offset-4 hover:text-brand-charcoal"
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* ── Mode 3: FORGOT PASSWORD ─────────────────────────────────────── */}
        {currentMode === 'forgot' && (
          <div className="mt-8 space-y-6">
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <Input
                label="Email or Username"
                required
                value={form.identifier}
                onChange={setField('identifier')}
                placeholder="Enter your email or username"
              />

              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                Send Reset Code
              </Button>
            </form>

            <div className="rounded border border-brand-border bg-brand-cream/30 p-4 text-body-xs text-brand-muted flex items-center justify-between">
              <span>Already have a reset code or link?</span>
              <Link
                to={
                  verificationState.email || form.identifier
                    ? `/reset-password?email=${encodeURIComponent((verificationState.email || form.identifier).trim())}`
                    : '/reset-password'
                }
                className="font-semibold text-brand-goldDark underline"
              >
                Enter code
              </Link>
            </div>

            <p className="text-body-sm text-brand-muted text-center">
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-semibold text-brand-goldDark underline underline-offset-4"
              >
                Back to Sign in
              </button>
            </p>
          </div>
        )}

        {/* ── Mode 4: EMAIL VERIFICATION (SKIPPABLE!) ─────────────────────── */}
        {currentMode === 'verify' && (
          <div className="mt-8 space-y-6">
            <div className="rounded-lg border border-brand-gold/40 bg-white p-5 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-brand-gold/40 bg-white text-brand-goldDark">
                <Icon name="mail" className="h-6 w-6" />
              </span>
              <h2 className="mt-3 font-serif text-xl font-medium text-brand-charcoal">
                Confirm your email address
              </h2>
              <p className="mt-1.5 text-body-sm text-brand-muted">
                Sent to <span className="font-semibold text-brand-charcoal">{verificationState.email || form.email || 'your email'}</span>.
                Please check your inbox (and spam or junk folder) for your 6-digit verification code.
              </p>
            </div>

            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <Input
                label="6-Digit Verification Code"
                required
                maxLength={6}
                value={verificationState.code}
                onChange={(e) => setVerificationState((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Enter the 6-digit code"
                className="text-center font-mono text-lg tracking-widest"
              />

              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                Verify Email Address
              </Button>
            </form>

            {/* The Skippable Action button — per requirement: "not nececery that can be skip" */}
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                fullWidth
                onClick={handleSkipVerification}
                className="border-brand-border text-brand-charcoal hover:bg-neutral-50"
              >
                Skip for now · Continue to Shop →
              </Button>
              <p className="mt-2 text-center text-body-xs text-brand-muted">
                You can verify later from your account settings at any time.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-brand-border pt-4 text-body-xs text-brand-muted">
              <span>Didn’t receive the code?</span>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={busy}
                className="font-semibold text-brand-goldDark underline hover:text-brand-charcoal"
              >
                Resend code
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export default SignInPage
