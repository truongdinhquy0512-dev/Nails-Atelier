import { apiClient } from "../../lib/apiClient";

export interface CheckoutLineInput {
  productSlug: string;
  shape: string;
  length: string;
  quantity: number;
}

export interface CheckoutQuote {
  items: {
    productSlug: string;
    productName: string;
    shape: string;
    length: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  shippingFee: number;
  totalAmount: number;
}

export interface CreateOrderInput {
  idempotencyKey: string;
  items: CheckoutLineInput[];
  paymentMethod: "BANK_TRANSFER" | "COD" | "MOMO";
  couponCode?: string;
  addressId?: number;
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
  transferReference?: string;
}

export interface CreatedOrder {
  id: number;
  orderCode: string;
  totalAmount: string | number;
}

export const orderApi = {
  async momoEnabled(signal?: AbortSignal) {
    return (await apiClient.get<{ enabled: boolean }>("/payments/momo/configuration", { signal })).data.enabled;
  },
  async openMomo(orderId: number) {
    const { data } = await apiClient.post<{ payUrl: string }>("/payments/momo/create", { orderId }, { headers: { "X-Atelier-Upload": "1" } });
    window.location.assign(data.payUrl);
  },
  async uploadReceipt(id: number, file: File, transferReference: string) {
    const data = new FormData();
    data.append("receipt", file);
    data.append("transferReference", transferReference);
    await apiClient.post(`/orders/${id}/payment-proof`, data, { headers: { "X-Atelier-Upload": "1" } });
  },
  async quote(
    items: CheckoutLineInput[],
    couponCode?: string
  ): Promise<CheckoutQuote> {
    const response = await apiClient.post<CheckoutQuote>("/orders/quote", {
      items,
      couponCode,
    });
    return response.data;
  },

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const response = await apiClient.post<CreatedOrder>("/orders", input);
    return response.data;
  },
};
