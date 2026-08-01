import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';

import { brand } from '@/data/brand';
import type { UserRole } from '@/lib/db/types';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';
import { panelNavigate } from '@/lib/navigation/panelNavigate';

import './LoginForm.css';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Error al iniciar sesión');
        return;
      }

      const role = data.user?.role as UserRole | undefined;
      void panelNavigate(role ? getDefaultRouteForRole(role) : '/panel');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-form">
      <header className="login-form__header">
        <img
          src={brand.assets.logoMark}
          alt={brand.name}
          className="login-form__logo-mobile"
          width={48}
          height={48}
        />
        <h1 className="login-form__title">Iniciar sesión</h1>
        <p className="login-form__subtitle">
          Ingresa tus credenciales para acceder al sistema
        </p>
      </header>

      <form className="login-form__form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="login-form__error" role="alert">
            {error}
          </div>
        )}

        <div className="login-form__field">
          <label htmlFor="username" className="login-form__label">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            className="login-form__input"
            placeholder="Tu nombre de usuario"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="login-form__field">
          <label htmlFor="password" className="login-form__label">
            Contraseña
          </label>
          <div className="login-form__password-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="login-form__input login-form__input--password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="login-form__toggle-password"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              disabled={loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button type="submit" className="login-form__submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={18} className="login-form__spinner" />
              Ingresando...
            </>
          ) : (
            <>
              <LogIn size={18} />
              Ingresar
            </>
          )}
        </button>
      </form>

      <footer className="login-form__footer">
        <p>{brand.name}</p>
        {brand.contact.phone && <span>{brand.contact.phone}</span>}
      </footer>
    </div>
  );
}
