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
    path: 'export',
    title: 'Export hub · Spendwise',
    loadComponent: () => import('./features/cloud/pages/export-hub').then((m) => m.ExportHub),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'new' },
      {
        path: 'new',
        title: 'New export · Spendwise',
        loadComponent: () => import('./features/cloud/pages/new-export').then((m) => m.NewExport),
      },
      {
        path: 'automations',
        title: 'Automations · Spendwise',
        loadComponent: () => import('./features/cloud/pages/automations').then((m) => m.Automations),
      },
      {
        path: 'history',
        title: 'Export history · Spendwise',
        loadComponent: () => import('./features/cloud/pages/history').then((m) => m.History),
      },
      {
        path: 'integrations',
        title: 'Integrations · Spendwise',
        loadComponent: () => import('./features/cloud/pages/integrations').then((m) => m.Integrations),
      },
      {
        path: 'sharing',
        title: 'Sharing · Spendwise',
        loadComponent: () => import('./features/cloud/pages/sharing').then((m) => m.Sharing),
      },
    ],
  },
  {
    path: 'shared/:token',
    title: 'Shared report · Spendwise',
    loadComponent: () => import('./features/cloud/pages/shared-view').then((m) => m.SharedView),
  },
  { path: '**', redirectTo: 'dashboard' },
];
