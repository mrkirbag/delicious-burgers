import { useEffect, useMemo, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';

import { brand } from '@/data/brand';
import { getNavSectionsForRole, isNavItemActive, type NavSection } from '@/data/navigation';
import type { UserRole } from '@/lib/db/types';

import './Navbar.css';

type NavbarProps = {
  currentPath: string;
  username: string;
  role: UserRole;
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
};

export default function Navbar({ currentPath, username, role }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const sections = getNavSectionsForRole(role);

  useEffect(() => {
    document.body.classList.toggle('nav-open', open);
    return () => document.body.classList.remove('nav-open');
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const navContent = useMemo(
    () =>
      sections.map((section) => {
        const isSingleItem = section.items.length === 1;

        return (
          <div
            key={section.id}
            className={`navbar__section${section.dividerBefore ? ' navbar__section--divided' : ''}`}
          >
            {!isSingleItem ? <p className="navbar__section-label">{section.label}</p> : null}

            <ul className="navbar__list">
              {section.items.map((item) => {
                const ItemIcon = item.icon;
                const active = isNavItemActive(item.href, currentPath);

                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={`navbar__link${active ? ' navbar__link--active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      title={item.description}
                    >
                      <ItemIcon size={20} strokeWidth={2} aria-hidden />
                      <span className="navbar__link-text">
                        <span className="navbar__link-label">{item.label}</span>
                        {isSingleItem && item.description ? (
                          <span className="navbar__link-desc">{item.description}</span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }),
    [sections, currentPath],
  );

  return (
    <>
      <header className="navbar-mobile">
        <button
          type="button"
          className="navbar-mobile__toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
        </button>

        <a href="/panel" className="navbar-mobile__brand">
          <img src={brand.assets.logoMark} alt={brand.name} width={32} height={32} />
          <span>{brand.shortName}</span>
        </a>
      </header>

      <button
        type="button"
        className={`navbar-backdrop${open ? ' navbar-backdrop--visible' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        aria-label="Cerrar menú"
      />

      <aside
        id="app-sidebar"
        className={`navbar${open ? ' navbar--open' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="navbar__header">
          <a href="/panel" className="navbar__brand">
            <img src={brand.assets.logoMark} alt="" width={36} height={36} aria-hidden />
            <div className="navbar__brand-text">
              <span className="navbar__brand-name">{brand.name}</span>
              <span className="navbar__brand-tagline">{brand.tagline}</span>
            </div>
          </a>

          <button
            type="button"
            className="navbar__close"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <nav className="navbar__nav">{navContent}</nav>

        <div className="navbar__footer">
          <div className="navbar__user">
            <span className="navbar__avatar" aria-hidden>
              {username.charAt(0).toUpperCase()}
            </span>
            <div className="navbar__user-info">
              <span className="navbar__username">{username}</span>
              <span className="navbar__role">{roleLabels[role]}</span>
            </div>
          </div>

          <form action="/api/auth/logout" method="post" className="navbar__logout-form">
            <button type="submit" className="navbar__logout">
              <LogOut size={18} strokeWidth={2} aria-hidden />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
