import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().min(1, 'Display name is required').max(100),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const workspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  icon: z.string().default('📁'),
  colour: z.string().default('#0d9488'),
});

export const contentSourceSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  content_text: z.string().max(100000),
  entry_date: z.string().min(1, 'Date is required'),
  tags: z.array(z.string()).default([]),
  ai_access: z.enum(['allowed', 'blocked']).default('allowed'),
  workspace_id: z.string().uuid('Workspace is required'),
  source_type: z.enum(['journal', 'knowledge']).default('journal'),
  project_id: z.string().uuid().nullable().optional(),
});

export const knowledgeDocumentSchema = z.object({
  document_type: z.enum(['note', 'reference', 'guide', 'spec', 'research', 'bookmark']).default('note'),
  category: z.string().max(100).nullable().optional(),
  status: z.enum(['active', 'archived', 'draft']).default('active'),
  review_due_at: z.string().nullable().optional(),
  allow_memory_extraction: z.boolean().default(true),
});

export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  workspace_id: z.string().uuid('Workspace is required'),
  status: z.enum(['active', 'paused', 'completed', 'archived']).default('active'),
  start_date: z.string().optional().or(z.literal('')),
  target_date: z.string().optional().or(z.literal('')),
});

export const collectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional().or(z.literal('')),
  icon: z.string().max(10).optional(),
  colour: z.string().max(20).optional(),
  workspace_id: z.string().uuid('Workspace is required'),
  parent_collection_id: z.string().uuid().nullable().optional(),
});

export type CollectionValues = z.infer<typeof collectionSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type WorkspaceValues = z.infer<typeof workspaceSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
export type ContentSourceValues = z.infer<typeof contentSourceSchema>;
export type KnowledgeDocumentValues = z.infer<typeof knowledgeDocumentSchema>;
export type ProjectValues = z.infer<typeof projectSchema>;
