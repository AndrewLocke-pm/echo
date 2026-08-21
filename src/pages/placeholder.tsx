import { Card, CardContent } from '@/components/ui/card';
import { type LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  milestone: string;
}

export function PlaceholderPage({ icon: Icon, title, description, milestone }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal/10">
            <Icon className="h-8 w-8 text-teal" />
          </div>
          <h3 className="text-lg font-medium">Coming in {milestone}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This feature is part of a future milestone and will be built after the core foundation is complete.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
