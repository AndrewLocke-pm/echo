import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useCallback, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

interface RichEditorProps {
  value: string;
  onChange: (json: string, text: string) => void;
  placeholder?: string;
  workspaceId?: string;
  contentSourceId?: string;
  editable?: boolean;
  variant?: 'journal' | 'knowledge';
}

export function RichEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  workspaceId,
  contentSourceId,
  editable = true,
  variant = 'knowledge',
}: RichEditorProps) {
  const lastEmittedRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: 'text-primary underline underline-offset-2' },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: { class: 'rounded-lg max-w-full' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ? safeParseJSON(value) : '',
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none min-h-[200px] focus:outline-none px-4 py-3',
          variant === 'journal' && 'min-h-[300px]',
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = JSON.stringify(ed.getJSON());
      const text = ed.getText();
      lastEmittedRef.current = json;
      onChange(json, text);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value || null;
    if (value) {
      editor.commands.setContent(safeParseJSON(value), { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="min-h-[200px] rounded-lg border bg-background animate-pulse" />;
  }

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      {editable && <Toolbar editor={editor} workspaceId={workspaceId} contentSourceId={contentSourceId} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({
  editor,
  workspaceId,
  contentSourceId,
}: {
  editor: Editor;
  workspaceId?: string;
  contentSourceId?: string;
}) {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(async () => {
    if (!workspaceId || !contentSourceId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const filePath = `${workspaceId}/${contentSourceId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);
      if (uploadError) {
        console.error('Upload failed:', uploadError);
        return;
      }
      const { data: urlData } = await supabase.storage.from('attachments').createSignedUrl(uploadData.path, 3600);
      if (urlData?.signedUrl) {
        editor.chain().focus().setImage({ src: urlData.signedUrl, alt: file.name }).run();
      }
    };
    input.click();
  }, [editor, workspaceId, contentSourceId]);

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
      {btn(editor.can().undo?.() ?? false, () => editor.chain().focus().undo().run(), <Undo className="h-4 w-4" />, 'Undo')}
      {btn(editor.can().redo?.() ?? false, () => editor.chain().focus().redo().run(), <Redo className="h-4 w-4" />, 'Redo')}
      <Sep />
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />, 'Italic')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="h-4 w-4" />, 'Underline')}
      {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="h-4 w-4" />, 'Strikethrough')}
      {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <Code className="h-4 w-4" />, 'Code')}
      <Sep />
      {btn(editor.isActive('heading', { level: 1 }), () => applyHeading(editor, 1), <Heading1 className="h-4 w-4" />, 'Heading 1')}
      {btn(editor.isActive('heading', { level: 2 }), () => applyHeading(editor, 2), <Heading2 className="h-4 w-4" />, 'Heading 2')}
      {btn(editor.isActive('heading', { level: 3 }), () => applyHeading(editor, 3), <Heading3 className="h-4 w-4" />, 'Heading 3')}
      <Sep />
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />, 'Bullet list')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />, 'Ordered list')}
      {btn(editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), <ListChecks className="h-4 w-4" />, 'Task list')}
      {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <Quote className="h-4 w-4" />, 'Quote')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), <Minus className="h-4 w-4" />, 'Divider')}
      <Sep />
      {btn(editor.isActive('link'), setLink, <LinkIcon className="h-4 w-4" />, 'Link')}
      {btn(false, addImage, <ImageIcon className="h-4 w-4" />, 'Image')}
      <Sep />
      {btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), <AlignLeft className="h-4 w-4" />, 'Align left')}
      {btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), <AlignCenter className="h-4 w-4" />, 'Align center')}
      {btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), <AlignRight className="h-4 w-4" />, 'Align right')}
    </div>
  );
}

function applyHeading(editor: Editor, level: 1 | 2 | 3) {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const fromResolved = editor.state.doc.resolve(from);
  const toResolved = editor.state.doc.resolve(to);
  const sameTextblock =
    fromResolved.depth === toResolved.depth &&
    fromResolved.parent === toResolved.parent &&
    fromResolved.parent.isTextblock;

  if (!sameTextblock) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const block = fromResolved.parent;
  const blockStart = fromResolved.start(fromResolved.depth);
  const blockBefore = fromResolved.before(fromResolved.depth);
  const startOffset = from - blockStart;
  const endOffset = to - blockStart;
  const beforeContent = block.content.cut(0, startOffset);
  const selectedContent = block.content.cut(startOffset, endOffset);
  const afterContent = block.content.cut(endOffset);
  const paragraph = block.type.create(block.attrs, beforeContent);
  const heading = block.type.schema.nodes.heading.create({ level }, selectedContent);
  const trailingParagraph = block.type.create(block.attrs, afterContent);
  const replacement = Fragment.fromArray([
    beforeContent.size > 0 ? paragraph : null,
    heading,
    afterContent.size > 0 ? trailingParagraph : null,
  ].filter((node): node is typeof paragraph => node !== null));

  const transaction = editor.state.tr.replaceWith(blockBefore, fromResolved.after(fromResolved.depth), replacement);
  const headingStart = blockBefore + (beforeContent.size > 0 ? paragraph.nodeSize : 0) + 1;
  transaction.setSelection(TextSelection.create(transaction.doc, headingStart, headingStart + selectedContent.size));
  editor.view.dispatch(transaction);
}

function Sep() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: str }] }] };
  }
}
