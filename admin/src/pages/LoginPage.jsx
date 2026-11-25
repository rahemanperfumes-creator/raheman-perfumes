import { useState } from 'react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { Icon } from '@/components/ui/Icon'
import useSessionStore from '@/store/sessionStore'
import api from '@/lib/api'

/**
 * The staff door.
 *
 * Provides staff/owner authentication, password visibility toggling,
 * and a built-in Forgot & Reset Password workflow.
 */
export default function LoginPage() {
  const signIn = useSessionStore((state) => state.signIn)
  const busy = useSessionStore((state) => state.busy)
  const error = useSessionStore((state) => state.error)
  const clearError = useSessionStore((state) => state.clearError)
  const status = useSessionStore((state) => state.status)

  // Modes: 'login' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login')

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Forgot password form state
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState('')

  // Reset password form state
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetSuccess, setResetSuccess] = useState('')

  /** Client-side validation message */
  const [localError, setLocalError] = useState('')
  const busyRef = useRef(false)

    const submitLogin = async (event) => {
      event.preventDefault()
      if (busyRef.current || busy) return

      const fields = new FormData(event.currentTarget)
      const address = String(fields.get('email') ?? '').trim()
      const secret = String(fields.get('password') ?? '')

      setEmail(address)
      setPassword(secret)

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        setLocalError('Enter a complete email address, like you@rahemanperfumes.in.')
        return
      }
      if (!secret) {
        setLocalError('Enter your password.')
        return
      }

      setLocalError('')
      busyRef.current = true
      try {
        await signIn(address, secret)
      } finally {
        busyRef.current = false
      }
    }

    const submitForgot = async (event) => {
      event.preventDefault()
      const address = forgotEmail.trim()
      if (!address) {
        setLocalError('Enter your admin email address.')
        return
      }

      setLocalError('')
      setForgotBusy(true)
      try {
        const res = await api.post('/auth/password/forgot', { email: address })
        setForgotSuccess(res?.message || 'A reset code has been sent if an account matches.')
        setMode('reset')
      } catch (err) {
        setLocalError(err.message || 'Failed to request password reset.')
      } finally {
        setForgotBusy(false)
      }
    }

    const submitReset = async (event) => {
      event.preventDefault()
      const code = resetCode.trim()
      const address = forgotEmail.trim() || email.trim()
      const pass = newPassword

      if (!code) {
        setLocalError('Enter the 6-digit reset code.')
        return
      }
      if (pass.length < 8) {
        setLocalError('New password must be at least 8 characters.')
        return
      }

      setLocalError('')
      setResetBusy(true)
      try {
        const res = await api.post('/auth/password/reset', {
          email: address,
          code,
          password: pass,
        })
        setResetSuccess(res?.message || 'Password successfully reset! Please sign in with your new password.')
        setPassword('')
        setTimeout(() => {
          setMode('login')
          setResetSuccess('')
        }, 2500)
      } catch (err) {
        setLocalError(err.message || 'Failed to reset password. Check your code and try again.')
      } finally {
        setResetBusy(false)
      }
    }

    const edited = (setter) => (event) => {
      if (error) clearError()
      if (localError) setLocalError('')
      setter(event.target.value)
    }

    useEffect(() => {
      if (!error) return undefined
      const timer = setTimeout(clearError, 4000)
      return () => clearTimeout(timer)
    }, [error, clearError])

    return (
      <div className="min-h-screen bg-surface-low flex items-center justify-center px-gutter py-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3.5 mb-8">
            <img
              src="/logo.png"
              alt="Raheman Perfumes"
              draggable={false}
              loading="eager"
              className="h-16 w-16 shrink-0 rounded-full object-contain drop-shadow-sm"
            />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-goldDark">
                Store Administration
              </p>
              <p className="text-xs text-ink-muted mt-1">
                Authorized Staff Portal
              </p>
            </div>
          </div>

          <div className="bg-brand-paper border border-outline-variant rounded-lg shadow-card overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand-goldDark to-brand-gold" />

              {/* ── Mode 1: LOGIN ── */}
              {mode === 'login' && (
                <form onSubmit={submitLogin} className="p-8 space-y-5">
                  <div className="flex items-center justify-between">
                    <h1 className="font-serif text-2xl text-ink">Sign in</h1>
                  </div>

              {resetSuccess && (
                <p
                  role="status"
                  className="flex items-start gap-2 text-sm text-state-active bg-state-activeSurface border border-state-active/30 rounded-md px-3 py-2.5"
                >
                  <Icon name="check-circle" className="w-4 h-4 mt-0.5 shrink-0 text-state-active" />
                  <span>{resetSuccess}</span>
                </p>
              )}

              {localError || error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-error bg-state-haltedSurface border border-error/20 rounded-md px-3 py-2.5"
                >
                  <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{localError || error}</span>
                </p>
              ) : null}

              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={edited(setEmail)}
                placeholder="Enter your admin email"
              />

              <div>
                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={edited(setPassword)}
                  placeholder="Enter your password"
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="p-1 -mr-1 text-ink-muted hover:text-ink transition-colors focus:outline-none focus:text-brand-goldDark"
                      title={showPassword ? 'Hide password' : 'View password'}
                      aria-label={showPassword ? 'Hide password' : 'View password'}
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                    </button>
                  }
                />

                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError('')
                      setForgotEmail(email)
                      setMode('forgot')
                    }}
                    className="text-xs font-semibold text-brand-goldDark hover:underline focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={busy}
                disabled={status === 'checking'}
              >
                  Sign in
                </Button>
            </form>
          )}

            {/* ── Mode 2: FORGOT PASSWORD ── */}
            {mode === 'forgot' && (
            <form onSubmit={submitForgot} className="p-8 space-y-5">
              <div>
                <h1 className="font-serif text-2xl text-ink">Forgot password</h1>
                <p className="text-xs text-ink-muted mt-1">
                  Enter your admin email address and we'll send a 6-digit verification code.
                </p>
              </div>

              {localError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-error bg-state-haltedSurface border border-error/20 rounded-md px-3 py-2.5"
                >
                  <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{localError}</span>
                </p>
              )}

              <Input
                label="Admin Email"
                name="forgotEmail"
                type="email"
                required
                autoFocus
                value={forgotEmail}
                onChange={edited(setForgotEmail)}
                placeholder="ayaan@rahemanperfumes.in"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={forgotBusy}
              >
                Send Reset Code
              </Button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('')
                    setMode('login')
                  }}
                  className="text-ink-muted hover:text-ink hover:underline flex items-center gap-1"
                >
                  <Icon name="arrow-left" className="w-3.5 h-3.5" /> Back to sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('')
                    setMode('reset')
                  }}
                  className="text-brand-goldDark font-semibold hover:underline"
                >
                  Already have code?
                </button>
              </div>
            </form>
          )}

          {/* ── Mode 3: RESET PASSWORD ── */}
          {mode === 'reset' && (
            <form onSubmit={submitReset} className="p-8 space-y-5">
              <div>
                <h1 className="font-serif text-2xl text-ink">Reset password</h1>
                <p className="text-xs text-ink-muted mt-1">
                  Enter the 6-digit code sent to <strong className="text-ink">{forgotEmail || email || 'your email'}</strong> and set your new password.
                </p>
              </div>

              {forgotSuccess && (
                <p
                  role="status"
                  className="text-xs text-brand-goldDark bg-brand-gold/10 border border-brand-gold/20 rounded-md p-2.5"
                >
                  {forgotSuccess}
                </p>
              )}

              {localError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-error bg-state-haltedSurface border border-error/20 rounded-md px-3 py-2.5"
                >
                  <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{localError}</span>
                </p>
              )}

              <Input
                label="6-Digit Reset Code"
                name="resetCode"
                type="text"
                required
                autoFocus
                maxLength={6}
                value={resetCode}
                onChange={edited(setResetCode)}
                placeholder="123456"
                className="font-mono tracking-widest text-center text-lg"
              />

              <Input
                label="New Password"
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={edited(setNewPassword)}
                placeholder="At least 8 characters"
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="p-1 -mr-1 text-ink-muted hover:text-ink transition-colors focus:outline-none"
                    title={showNewPassword ? 'Hide password' : 'View password'}
                    aria-label={showNewPassword ? 'Hide password' : 'View password'}
                  >
                    <Icon name={showNewPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                  </button>
                }
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={resetBusy}
              >
                Change Password & Sign In
              </Button>

              <div className="flex justify-center pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('')
                    setMode('login')
                  }}
                  className="text-ink-muted hover:text-ink hover:underline flex items-center gap-1"
                >
                  <Icon name="arrow-left" className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div >
  )
}
