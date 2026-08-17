import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getActiveCashRegister } from '@/lib/db/cash-registers';
import { getExchangeRates } from '@/lib/db/exchange-rates';
import { getOrderDetail, payOrder } from '@/lib/db/orders';
import type { ForeignCurrency, OrderPaymentInput, UserRole } from '@/lib/db/types';
import { payableForeignAmount } from '@/lib/payments/settlement';
import {
  isBsPaymentMethod,
  isCopPaymentMethod,
  isUsdPaymentMethod,
  isValidPaymentMethod,
  requiresForeignAmount,
} from '@/lib/payments/methods';

const PAY_ROLES: UserRole[] = ['admin', 'cajero'];

type PaymentBody = {
  payment_method?: string;
  amount_cop?: number;
  foreign_currency?: string;
  foreign_amount?: number;
};

function parsePayments(body: {
  payments?: PaymentBody[];
  payment_method?: string;
  foreign_currency?: string;
}): OrderPaymentInput[] | string {
  if (Array.isArray(body.payments) && body.payments.length > 0) {
    const payments: OrderPaymentInput[] = [];

    for (const line of body.payments) {
      const paymentMethod = line.payment_method?.trim();
      if (!paymentMethod || !isValidPaymentMethod(paymentMethod)) {
        return 'Método de pago inválido';
      }

      const amountCop = Number(line.amount_cop);
      if (!Number.isFinite(amountCop) || amountCop <= 0) {
        return 'Cada pago debe tener un monto en COP mayor a 0';
      }

      let foreignCurrency = line.foreign_currency?.trim() as ForeignCurrency | undefined;
      if (foreignCurrency && foreignCurrency !== 'usd' && foreignCurrency !== 'bs') {
        return 'Moneda extranjera inválida';
      }

      const foreignAmount =
        line.foreign_amount != null ? Number(line.foreign_amount) : null;

      if (paymentMethod === 'divisas' && !foreignCurrency) {
        return 'Debes indicar USD o BS para pagos en divisas';
      }

      if (isUsdPaymentMethod(paymentMethod)) {
        foreignCurrency = 'usd';
      }

      if (isBsPaymentMethod(paymentMethod)) {
        foreignCurrency = 'bs';
      }

      if (requiresForeignAmount(paymentMethod) && (!foreignAmount || foreignAmount <= 0)) {
        return isBsPaymentMethod(paymentMethod)
          ? 'El monto en bolívares debe ser mayor a 0'
          : 'El monto en dólares debe ser mayor a 0';
      }

      if (isCopPaymentMethod(paymentMethod) && (foreignCurrency || foreignAmount)) {
        return 'La moneda extranjera no aplica para este método de pago';
      }

      payments.push({
        payment_method: paymentMethod,
        amount_cop: amountCop,
        foreign_currency: foreignCurrency ?? null,
        foreign_amount: foreignAmount,
      });
    }

    return payments;
  }

  const paymentMethod = body.payment_method?.trim();
  if (!paymentMethod || !isValidPaymentMethod(paymentMethod)) {
    return 'Debes enviar al menos un pago';
  }

  const foreignCurrency = body.foreign_currency?.trim() as ForeignCurrency | undefined;
  if (foreignCurrency && foreignCurrency !== 'usd' && foreignCurrency !== 'bs') {
    return 'Moneda extranjera inválida';
  }

  if (paymentMethod === 'divisas' && !foreignCurrency) {
    return 'Debes indicar USD o BS para pagos en divisas';
  }

  return [
    {
      payment_method: paymentMethod,
      amount_cop: 0,
      foreign_currency: foreignCurrency ?? null,
      foreign_amount: null,
    },
  ];
}

export const POST: APIRoute = async (context) => {
  const session = requireRoles(context, PAY_ROLES);
  if (session instanceof Response) return session;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  let body: {
    payments?: PaymentBody[];
    payment_method?: string;
    foreign_currency?: string;
    cash_register_id?: string;
  };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const parsed = parsePayments(body);
  if (typeof parsed === 'string') {
    return Response.json({ error: parsed }, { status: 400 });
  }

  let payments = parsed;

  if (payments.length === 1 && payments[0].amount_cop === 0) {
    const detail = await getOrderDetail(id);
    if (!detail) {
      return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
    }

    let payment = {
      ...payments[0],
      amount_cop: detail.order.total,
    };

    if (requiresForeignAmount(payment.payment_method)) {
      const rates = await getExchangeRates();
      if (isBsPaymentMethod(payment.payment_method)) {
        payment = {
          ...payment,
          foreign_currency: 'bs',
          foreign_amount: payableForeignAmount(detail.order.total, rates.bs_rate),
        };
      } else {
        payment = {
          ...payment,
          foreign_currency: payment.foreign_currency ?? 'usd',
          foreign_amount: payableForeignAmount(detail.order.total, rates.usd_rate),
        };
      }
    } else if (payment.payment_method === 'divisas' && payment.foreign_currency) {
      const rates = await getExchangeRates();
      const rate =
        payment.foreign_currency === 'usd' ? rates.usd_rate : rates.bs_rate;
      payment = {
        ...payment,
        foreign_amount: payableForeignAmount(detail.order.total, rate),
      };
    }

    payments = [payment];
  }

  let cashRegisterId = body.cash_register_id?.trim();

  if (!cashRegisterId) {
    const active = await getActiveCashRegister();
    if (!active) {
      return Response.json({ error: 'No hay una caja abierta' }, { status: 400 });
    }
    cashRegisterId = active.id;
  }

  try {
    const order = await payOrder(id, cashRegisterId, payments);
    const detail = await getOrderDetail(id);

    return Response.json({
      order,
      items: detail?.items ?? [],
      payments: detail?.payments ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cobrar la comanda';
    return Response.json({ error: message }, { status: 400 });
  }
};
