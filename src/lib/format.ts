import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function truncate(text: string, max = 150): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '...';
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

export const WORKSPACE_ICONS = [
  '📁', '🏠', '💼', '🏥', '🎯', '🏗️', '📚', '🌱', '🎨', '🔬',
  '🧠', '💪', '✈️', '🎮', '🎵', '🍳', '💰', '🔒', '⭐', '🔥',
];

export const WORKSPACE_COLOURS = [
  '#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#db2777',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488',
];
