import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, DollarSign, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { fetchJson, parseError } from '@/lib/api/parseError';
import type { ExchangeRates } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatDateTime } from '@/lib/utils/datetime';
import { formatBs, formatCop, formatUsd } from '@/lib/utils/currency';

import '@/components/settings/ExchangeRatesManager.css';

type RatesForm = {
  usd_rate: string;
  bs_rate: string;
};

const EXAMPLE_AMOUNT = 50000;

async function fetchExchangeRates(): Promise<ExchangeRates> {
  const data = await fetchJson<{ rates: ExchangeRates }>('/api/exchange-rates');
  return data.rates;
}

function ExchangeRatesManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<RatesForm>({ usd_rate: '', bs_rate: '' });
  const [error, setError] = useState('');

  const { data: rates, isLoading, error: loadError } = useQuery({
    queryKey: queryKeys.exchangeRates,
    queryFn: fetchExchangeRates,
  });

  useEffect(() => {
    if (rates) {
      setForm({
        usd_rate: String(rates.usd_rate),
        bs_rate: String(rates.bs_rate),
      });
    }
  }, [rates]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { usd_rate: number; bs_rate: number }) => {
      const response = await fetch('/api/exchange-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await parseError(response));
      const data = await response.json();
      return data.rates as ExchangeRates;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.exchangeRates, updated);
      setForm({
        usd_rate: String(updated.usd_rate),
        bs_rate: String(updated.bs_rate),
      });
      toast.success('Tasas actualizadas correctamente');
      setError('');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las tasas');
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const usdRate = Number(form.usd_rate);
    const bsRate = Number(form.bs_rate);

    if (!Number.isFinite(usdRate) || usdRate <= 0) {
      setError('La tasa USD debe ser un número mayor a 0');
      return;
    }

    if (!Number.isFinite(bsRate) || bsRate <= 0) {
      setError('La tasa BS debe ser un número mayor a 0');
      return;
    }

    saveMutation.mutate({ usd_rate: usdRate, bs_rate: bsRate });
  }

  const previewRates: ExchangeRates | null =
    rates && Number(form.usd_rate) > 0 && Number(form.bs_rate) > 0
      ? {
          ...rates,
          usd_rate: Number(form.usd_rate),
          bs_rate: Number(form.bs_rate),
        }
      : (rates ?? null);

  const displayError =
    error ||
    (loadError instanceof Error ? loadError.message : loadError ? 'No se pudieron cargar las tasas' : '');

  if (isLoading) {
    return <Spinner label="Cargando tasas…" className="exchange-rates__loading" />;
  }

  return (
    <div className="exchange-rates">
      {displayError && <Alert>{displayError}</Alert>}

      <div className="exchange-rates__layout">
        <form className="exchange-rates__form" onSubmit={handleSubmit}>
          <div className="exchange-rates__card">
            <div className="exchange-rates__card-header">
              <DollarSign size={20} />
              <div>
                <h2>Tasa USD</h2>
              </div>
            </div>

            <label className="exchange-rates__label">
              Valor en COP
              <div className="exchange-rates__input-wrap">
                <span className="exchange-rates__prefix">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.usd_rate}
                  onChange={(e) => setForm((prev) => ({ ...prev, usd_rate: e.target.value }))}
                  className="exchange-rates__input"
                  required
                />
              </div>
            </label>
          </div>

          <div className="exchange-rates__card">
            <div className="exchange-rates__card-header">
              <Coins size={20} />
              <div>
                <h2>Tasa BS</h2>
              </div>
            </div>

            <label className="exchange-rates__label">
              Valor en COP
              <div className="exchange-rates__input-wrap">
                <span className="exchange-rates__prefix">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.bs_rate}
                  onChange={(e) => setForm((prev) => ({ ...prev, bs_rate: e.target.value }))}
                  className="exchange-rates__input"
                  required
                />
              </div>
            </label>
          </div>

          <button type="submit" className="exchange-rates__btn" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="exchange-rates__spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            Guardar tasas
          </button>

          {rates && (
            <p className="exchange-rates__updated">
              Última actualización: {formatDateTime(rates.updated_at)}
            </p>
          )}
        </form>

        <aside className="exchange-rates__preview">
          <h3>Vista previa de conversión</h3>

          {previewRates ? (
            <dl className="exchange-rates__preview-grid">
              <div>
                <dt>Pesos (COP)</dt>
                <dd>{formatCop(EXAMPLE_AMOUNT)}</dd>
              </div>
              <div>
                <dt>Dólares (USD)</dt>
                <dd>{formatUsd(EXAMPLE_AMOUNT / previewRates.usd_rate)}</dd>
              </div>
              <div>
                <dt>Bolívares (BS)</dt>
                <dd>{formatBs(EXAMPLE_AMOUNT / previewRates.bs_rate)}</dd>
              </div>
            </dl>
          ) : (
            <p className="exchange-rates__preview-empty">Ingresa tasas válidas para ver la vista previa.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default withAppProviders(ExchangeRatesManager);
