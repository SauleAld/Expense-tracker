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
  { path: '**', redirectTo: 'dashboard' },
];
