import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Spendwise',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'expenses',
    title: 'Expenses · Spendwise',
    loadComponent: () => import('./features/expenses/expenses').then((m) => m.Expenses),
  },
  {
    path: 'bank',
    title: 'Bank sync · Spendwise',
    loadComponent: () => import('./features/bank/pages/bank-sync').then((m) => m.BankSync),
  },
  {
    path: 'deposits',
    title: 'Deposits · Spendwise',
    loadComponent: () => import('./features/deposits/deposits').then((m) => m.Deposits),
  },
  { path: '**', redirectTo: 'dashboard' },
];
