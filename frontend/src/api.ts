import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export interface Invoice {
  id: number;
  invoice_code: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  goods_name: string | null;
  image_path: string;
  raw_text: string | null;
  created_at: string;
}

export function getImageUrl(path: string): string {
  return `/uploads/${path}`;
}

export type OcrBoxes = Record<string, [number, number, number, number]>;

export async function uploadInvoice(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ success: boolean; data: Invoice; boxes?: OcrBoxes }>('/invoices/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listInvoices(params: {
  startDate?: string;
  endDate?: string;
  keyword?: string;
}) {
  const { data } = await api.get<{ data: Invoice[] }>('/invoices/list', { params });
  return data.data;
}

export async function getInvoice(id: number) {
  const { data } = await api.get<{ data: Invoice }>(`/invoices/${id}`);
  return data.data;
}

export async function getStats(params: {
  startDate?: string;
  endDate?: string;
  keyword?: string;
}) {
  const { data } = await api.get<{ count: number; totalAmount: number }>('/invoices/stats', {
    params,
  });
  return data;
}

export async function deleteInvoice(id: number) {
  await api.delete(`/invoices/${id}`);
}

export async function updateInvoice(id: number, data: Partial<Invoice>) {
  const { data: res } = await api.put<{ success: boolean; data: Invoice }>(`/invoices/${id}`, data);
  return res;
}
