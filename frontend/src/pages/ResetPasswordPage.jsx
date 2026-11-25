import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Breadcrumbs } from '@/components/ui/SectionHeading'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { Icon } from '@/components/ui/Icon'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useUiStore } from '@/store/uiStore'
import { authService } from '@/services/authService'

export function ResetPasswordPage() {
  useDocumentTitle('Reset Password')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useUiStore((state) => state.pushToast)

  const tokenParam = params.get('token') || ''
  const emailParam = params.get('email') || ''

  const [form, setForm] = useState({
    identifier: emailParam,
    code: '',
    token: tokenParam,
    password: '',
    confirmPassword: '',
  })
  const [useToken, setUseToken] = useState(Boolean(tokenParam))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (tokenParam) {
      setForm((prev) => ({ ...prev, token: tokenParam, identifier: emailParam || prev.identifier }))
      setUseToken(true)
    }
  }, [tokenParam, emailParam])

  const set = (field) => (e) => {
    if (error) setError('')
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busyRef.current) return
    setError('')

    if (form.password.length < 8) {
      return setError('Your new password must be at least 8 characters long.')
    }
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match.')
    }
    if (!useToken && !form.code.trim()) {
      return setError('Please enter the 6-digit reset code.')
    }
    if (!useToken && !form.identifier.trim()) {
      return setError('Please enter your email or username.')
    }

    busyRef.current = true
    setBusy(true)
    try {
      const payload = {
        password: form.password,
        ...(useToken ? { token: form.token } : { code: form.code.trim(), identifier: form.identifier.trim() }),
      }
      const res = await authService.resetPassword(payload)
      busyRef.current = false
      setBusy(false)

      toast({
        title: 'Password reset successful',
        description: res.data?.message || 'Your password has been changed. Please sign in.',
      })
      navigate('/sign-in')
    } catch (err) {
      busyRef.current = false
      setBusy(false)
      setError(err.message || 'Could not reset password. The link or code may have expired.')
    }
  }

  return (
    <div className="shell py-8 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Sign In', to: '/sign-in' }, { label: 'Reset Password' }]} className="mb-6" />

      <div className="mx-auto max-w-md">
        <h1 className="font-serif text-3xl font-medium text-brand-charcoal lg:text-headline-lg">
          Reset your password
        </h1>
        <p className="mt-2 text-body-md text-brand-muted">
          Choose a secure password of at least 8 characters.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-6 flex items-start gap-2 rounded border border-tier-original/30 bg-tier-originalSurface px-4 py-3 text-body-sm text-tier-original"
          >
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <form onSubmit={submit} className="mt-8 space-y-5">
          {!useToken && (
            <>
              <Input
                label="Email or Username"
                required
                value={form.identifier}
                onChange={set('identifier')}
                placeholder="Enter your email or username"
              />
              <Input
                label="6-Digit Reset Code"
                required
                maxLength={6}
                value={form.code}
                onChange={set('code')}
                placeholder="Enter the 6-digit code"
              />
            </>
          )}

          {useToken && (
            <div className="rounded border border-brand-border bg-brand-cream/30 p-3 text-body-xs text-brand-muted flex items-center justify-between">
              <span>Using reset link security token</span>
              <button
                type="button"
                onClick={() => setUseToken(false)}
                className="text-brand-goldDark font-semibold underline"
              >
                Use 6-digit code instead
              </button>
            </div>
          )}

          <div className="relative">
            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              hint="Minimum 8 characters"
              value={form.password}
              onChange={set('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-8 text-brand-muted hover:text-brand-charcoal text-body-xs"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <Input
            label="Confirm New Password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
          />

          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            Save New Password
          </Button>
        </form>

        <p className="mt-6 text-body-sm text-brand-muted text-center">
          Remember your credentials?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-goldDark underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ResetPasswordPage

