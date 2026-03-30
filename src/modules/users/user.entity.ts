export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  profile?: FreelancerProfile;
  clients?: Client[];
  services?: Service[];
  invoices?: Invoice[];
}

export interface FreelancerProfile {
  id: string;
  userId: string;
  displayName: string;
  legalName: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  country: string;
  vatNumber?: string;
  siret?: string;
  updatedAt: Date;
  user?: User;
}

export interface Client {
  id: string;
  userId: string;
  name: string;
  email: string;
  company: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  invoices?: Invoice[];
}

export interface Service {
  id: string;
  userId: string;
  title: string;
  hourlyRateHt: number;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  lines?: InvoiceLine[];
}

export interface Invoice {
  id: string;
  userId: string;
  clientId: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  issueDate: Date;
  dueDate?: Date;
  currency: string;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  client?: Client;
  lines?: InvoiceLine[];
  events?: InvoiceStatusEvent[];
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceId?: string;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceHt: number;
  vatRate: number;
  lineHt: number;
  lineVat: number;
  lineTtc: number;
  createdAt: Date;
  invoice?: Invoice;
  service?: Service;
}

export interface InvoiceStatusEvent {
  id: string;
  invoiceId: string;
  fromStatus?: 'draft' | 'sent' | 'paid' | 'cancelled';
  toStatus: 'draft' | 'sent' | 'paid' | 'cancelled';
  changedAt: Date;
  invoice?: Invoice;
}