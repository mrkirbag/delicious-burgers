import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Search, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Alert, EmptyState, SkeletonTable } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { PublicUser } from '@/lib/db/users';
import type { UserRole } from '@/lib/db/types';
import { useUsers } from '@/lib/hooks/queries/useUsers';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';

import './UsersManager.css';

type UsersManagerProps = {
  currentUserId: string;
};

type FormMode = 'create' | 'edit';

type UserFormState = {
  username: string;
  password: string;
  role: UserRole;
  active: boolean;
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
};

const roleOptions: UserRole[] = ['admin', 'cajero', 'mesero', 'cocina'];

type RoleFilter = UserRole | 'all';

const emptyForm: UserFormState = {
  username: '',
  password: '',
  role: 'mesero',
  active: true,
};

function UsersManager({ currentUserId }: UsersManagerProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { users, isLoading, error: loadError } = useUsers();
  const [formError, setFormError] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!query) return true;

      const roleLabel = roleLabels[user.role].toLowerCase();
      const statusLabel = user.active ? 'activo' : 'inactivo';

      return (
        user.username.toLowerCase().includes(query) ||
        roleLabel.includes(query) ||
        statusLabel.includes(query)
      );
    });
  }, [users, roleFilter, searchQuery]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      mode: FormMode;
      userId?: string;
      body: Record<string, unknown>;
    }) => {
      const url =
        payload.mode === 'edit' && payload.userId ? `/api/users/${payload.userId}` : '/api/users';
      const method = payload.mode === 'edit' ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success(variables.mode === 'create' ? 'Usuario creado' : 'Usuario actualizado');
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el usuario'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: PublicUser) => {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('Estado del usuario actualizado');
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo actualizar el estado'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      setConfirmDeleteId(null);
      toast.success('Usuario eliminado');
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario'),
  });

  function clearFilters() {
    setRoleFilter('all');
    setSearchQuery('');
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingUser(null);
    setForm(emptyForm);
    setFormError('');
  }

  function openEditForm(user: PublicUser) {
    setFormMode('edit');
    setEditingUser(user);
    setForm({
      username: user.username,
      password: '',
      role: user.role,
      active: user.active,
    });
    setFormError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError('');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (formMode === 'create') {
      saveMutation.mutate({
        mode: 'create',
        body: {
          username: form.username,
          password: form.password,
          role: form.role,
        },
      });
      return;
    }

    if (formMode === 'edit' && editingUser) {
      saveMutation.mutate({
        mode: 'edit',
        userId: editingUser.id,
        body: {
          username: form.username,
          password: form.password || undefined,
          role: form.role,
          active: form.active,
        },
      });
    }
  }

  const displayError =
    formError ||
    (loadError instanceof Error ? loadError.message : loadError ? 'No se pudo cargar la lista' : '');

  return (
    <div className="users-manager">
      <div className="users-manager__toolbar">
        <div className="users-manager__toolbar-left">
          <div className="users-manager__summary" aria-live="polite">
            <span className="users-manager__summary-value">{filteredUsers.length}</span>
            <div className="users-manager__summary-copy">
              <span className="users-manager__summary-label">
                {filteredUsers.length === 1 ? 'usuario' : 'usuarios'}
              </span>
              {filteredUsers.length !== users.length && (
                <span className="users-manager__summary-total">de {users.length} en total</span>
              )}
            </div>
          </div>
          <label className="users-manager__search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar usuarios..."
              aria-label="Buscar usuarios"
            />
            {searchQuery && (
              <button
                type="button"
                className="users-manager__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </label>
          <label className="users-manager__filter">
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              aria-label="Filtrar por rol"
            >
              <option value="all">Todos los usuarios</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="users-manager__create" onClick={openCreateForm}>
          <Plus size={18} />
          Nuevo usuario
        </button>
      </div>

      {displayError && !formMode && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : users.length === 0 ? (
        <EmptyState
          title="No hay usuarios registrados."
          actions={
            <button type="button" className="users-manager__create" onClick={openCreateForm}>
              <Plus size={18} />
              Crear el primero
            </button>
          }
        />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title={
            searchQuery.trim()
              ? `No se encontraron usuarios para "${searchQuery.trim()}".`
              : 'No hay usuarios con el rol seleccionado.'
          }
          actions={
            <button type="button" className="users-manager__cancel" onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="users-manager__table-wrap">
          <table className="users-manager__table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isSelf = user.id === currentUserId;

                return (
                  <tr key={user.id}>
                    <td data-label="Usuario">
                      <div className="users-manager__user-cell">
                        <span className="users-manager__avatar" aria-hidden>
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <span className="users-manager__username">{user.username}</span>
                          {isSelf && <span className="users-manager__self-badge">Tú</span>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Rol">
                      <span className={`users-manager__role users-manager__role--${user.role}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td data-label="Estado">
                      <span
                        className={`users-manager__status${
                          user.active ? ' users-manager__status--active' : ''
                        }`}
                      >
                        {user.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      <div className="users-manager__actions">
                        <button
                          type="button"
                          className="users-manager__action"
                          onClick={() => openEditForm(user)}
                          aria-label={`Editar ${user.username}`}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="users-manager__action"
                          onClick={() => toggleActiveMutation.mutate(user)}
                          disabled={isSelf || toggleActiveMutation.isPending}
                          aria-label={
                            user.active ? `Desactivar ${user.username}` : `Activar ${user.username}`
                          }
                          title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
                        >
                          {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>

                        {confirmDeleteId === user.id ? (
                          <div className="users-manager__confirm">
                            <button
                              type="button"
                              className="users-manager__confirm-yes"
                              onClick={() => deleteMutation.mutate(user.id)}
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              className="users-manager__confirm-no"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="users-manager__action users-manager__action--danger"
                            onClick={() => setConfirmDeleteId(user.id)}
                            disabled={isSelf}
                            aria-label={`Eliminar ${user.username}`}
                            title={isSelf ? 'No puedes eliminar tu propia cuenta' : undefined}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(formMode)}
        onClose={closeForm}
        title={formMode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
        panelClassName="users-manager__modal-panel"
        className="users-manager__modal"
      >
        <form className="users-manager__form" onSubmit={handleSubmit}>
          {formError && <Alert>{formError}</Alert>}

          <div className="users-manager__field">
            <label htmlFor="user-username">Usuario</label>
            <input
              id="user-username"
              type="text"
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="Nombre de usuario"
              required
              minLength={3}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="users-manager__field">
            <label htmlFor="user-password">Contraseña</label>
            <input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={formMode === 'create' ? 'Mínimo 8 caracteres' : '••••••••'}
              required={formMode === 'create'}
              minLength={formMode === 'create' ? 8 : undefined}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="users-manager__field">
            <label htmlFor="user-role">Rol</label>
            <select
              id="user-role"
              value={form.role}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
              }
              disabled={saveMutation.isPending || (formMode === 'edit' && editingUser?.id === currentUserId)}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>

          {formMode === 'edit' && (
            <label className="users-manager__checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, active: event.target.checked }))
                }
                disabled={saveMutation.isPending || editingUser?.id === currentUserId}
              />
              <span>Usuario activo</span>
            </label>
          )}

          <div className="users-manager__form-actions">
            <button
              type="button"
              className="users-manager__cancel"
              onClick={closeForm}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="users-manager__submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 size={16} className="users-manager__spinner" />
                  Guardando...
                </>
              ) : formMode === 'create' ? (
                'Crear usuario'
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default withAppProviders(UsersManager);
