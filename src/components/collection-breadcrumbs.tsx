import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { KnowledgeCollection } from '@/types';

interface CollectionBreadcrumbsProps {
  path: KnowledgeCollection[];
}

export function CollectionBreadcrumbs({ path }: CollectionBreadcrumbsProps) {
  if (path.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/knowledge" className="hover:text-foreground">Knowledge</Link>
      {path.map((col) => (
        <span key={col.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to={`/knowledge/collections/${col.id}`}
            className="hover:text-foreground"
          >
            {col.icon ? `${col.icon} ` : ''}
            {col.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

interface DocBreadcrumbsProps {
  collectionPath: KnowledgeCollection[];
  docTitle?: string;
}

export function DocBreadcrumbs({ collectionPath, docTitle }: DocBreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/knowledge" className="hover:text-foreground">Knowledge</Link>
      {collectionPath.map((col) => (
        <span key={col.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to={`/knowledge/collections/${col.id}`}
            className="hover:text-foreground"
          >
            {col.icon ? `${col.icon} ` : ''}
            {col.name}
          </Link>
        </span>
      ))}
      {docTitle && (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{docTitle}</span>
        </span>
      )}
    </nav>
  );
}
