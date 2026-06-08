"use client";
import { create } from "zustand";

const isBrowser = typeof window !== "undefined";

function getItem(key: string): string | null {
  return isBrowser ? sessionStorage.getItem(key) : null;
}

interface CustomerState {
  token: string | null;
  sessionId: string | null;
  branchSlug: string | null;
  tableCode: string | null;
  orderId: string | null;
  branchName: string | null;
  customerName: string | null;
  taxRate: number | null;
  currency: string | null;
  setSession: (data: {
    token: string;
    sessionId: string;
    branchSlug: string;
    tableCode: string;
    branchName?: string;
    customerName?: string;
    taxRate?: number;
    currency?: string;
  }) => void;
  setOrderId: (orderId: string) => void;
  clear: () => void;
}

export const useCustomerStore = create<CustomerState>((set) => ({
  token: getItem("customer_token"),
  sessionId: getItem("customer_session_id"),
  branchSlug: getItem("customer_branch_slug"),
  tableCode: getItem("customer_table_code"),
  orderId: getItem("customer_order_id"),
  branchName: getItem("customer_branch_name"),
  customerName: getItem("customer_name"),
  taxRate: getItem("customer_tax_rate") ? Number(getItem("customer_tax_rate")) : null,
  currency: getItem("customer_currency"),
  setSession: (data) => {
    set({
      token: data.token,
      sessionId: data.sessionId,
      branchSlug: data.branchSlug,
      tableCode: data.tableCode,
      branchName: data.branchName || null,
      customerName: data.customerName || null,
      taxRate: data.taxRate !== undefined ? data.taxRate : null,
      currency: data.currency || null,
    });
    if (isBrowser) {
      sessionStorage.setItem("customer_token", data.token);
      sessionStorage.setItem("customer_session_id", data.sessionId);
      sessionStorage.setItem("customer_branch_slug", data.branchSlug);
      sessionStorage.setItem("customer_table_code", data.tableCode);
      if (data.branchName) sessionStorage.setItem("customer_branch_name", data.branchName);
      if (data.customerName) sessionStorage.setItem("customer_name", data.customerName);
      if (data.taxRate !== undefined) sessionStorage.setItem("customer_tax_rate", String(data.taxRate));
      if (data.currency) sessionStorage.setItem("customer_currency", data.currency);
    }
  },
  setOrderId: (orderId) => {
    set({ orderId });
    if (isBrowser) {
      sessionStorage.setItem("customer_order_id", orderId);
    }
  },
  clear: () => {
    set({
      token: null,
      sessionId: null,
      branchSlug: null,
      tableCode: null,
      orderId: null,
      branchName: null,
      customerName: null,
      taxRate: null,
      currency: null,
    });
    if (isBrowser) {
      sessionStorage.removeItem("customer_token");
      sessionStorage.removeItem("customer_session_id");
      sessionStorage.removeItem("customer_order_id");
      sessionStorage.removeItem("customer_name");
      sessionStorage.removeItem("customer_branch_slug");
      sessionStorage.removeItem("customer_table_code");
      sessionStorage.removeItem("customer_branch_name");
      sessionStorage.removeItem("customer_tax_rate");
      sessionStorage.removeItem("customer_currency");
    }
  },
}));
