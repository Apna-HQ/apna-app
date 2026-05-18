import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface AuthorInfoProps {
    name?: string;
}

export function AuthorInfo({ name }: AuthorInfoProps) {
    return (
        <div className="flex items-center">
            <Avatar className="h-7 w-7 sm:h-6 sm:w-6">
                <AvatarFallback className="bg-amber-soft text-amber-strong text-xs">
                    {name?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
            </Avatar>
            <p className="ml-2 text-sm font-medium text-ink-3 truncate">
                {name || 'Anonymous'}
            </p>
        </div>
    );
}
