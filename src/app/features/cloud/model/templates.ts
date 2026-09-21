import type { IconName } from '../../../shared/icon';
import type { TemplateId } from './cloud-types';

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
  description: string;
  bestFor: string;
  icon: IconName;
  /** Which setting this template exposes, if any. */
  param: 'year' | 'months' | 'period' | null;
}

export const TEMPLATES: readonly TemplateMeta[] = [
  {
    id: 'tax',
    name: 'Tax Report',
    tagline: 'Itemised by category, per year',
    description: 'Every expense in the chosen year, grouped by category with subtotals and a yearly total.',
    bestFor: 'Accountants and tax filing',
    icon: 'document',
    param: 'year',
  },
  {
    id: 'monthly',
    name: 'Monthly Summary',
    tagline: 'Trends, month by month',
    description: 'One line per month: number of expenses, total, daily average, top category and change vs the month before.',
    bestFor: 'Budget reviews',
    icon: 'chart',
    param: 'months',
  },
  {
    id: 'category',
    name: 'Category Analysis',
    tagline: 'Where the money goes',
    description: 'Totals, share of spending, averages and the largest expense for each category.',
    bestFor: 'Finding savings',
    icon: 'table',
    param: 'period',
  },
  {
    id: 'ledger',
    name: 'Full Ledger',
    tagline: 'Every record, newest first',
    description: 'A plain list of all your expenses with a grand total. Nothing summarised.',
    bestFor: 'Backups and spreadsheets',
    icon: 'list',
    param: null,
  },
];

export const templateMeta = (id: TemplateId): TemplateMeta => TEMPLATES.find((t) => t.id === id)!;
