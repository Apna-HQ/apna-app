'use client'

import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GetNpubProfileMetadata } from '@/lib/nostr'
import { useState } from 'react'

interface AppDetails {
    id: string;
    appName: string;
    reactions: any[];
    avgRating: string;
}

interface Feedback {
    rating: number;
    feedback: string;
    isNewFormat: boolean;
    pubkey: string;
    authorMetadata: {
        name?: string;
    };
}

export function RatingDisplay({ app }: { app: AppDetails }) {
    const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const handleOpenChange = async (open: boolean) => {
        if (open) {
            const feedbacks = await Promise.all(app.reactions.map(async (reaction) => {
                const authorMetadata = await GetNpubProfileMetadata(reaction.pubkey);
                try {
                    const data = JSON.parse(reaction.content);
                    return {
                        rating: data.rating,
                        feedback: data.feedback,
                        isNewFormat: true,
                        pubkey: reaction.pubkey,
                        authorMetadata
                    };
                } catch (e) {
                    return {
                        rating: reaction.content === '+' ? 5 : 1,
                        feedback: reaction.content === '+' ? 'Liked it' : 'Disliked it',
                        isNewFormat: false,
                        pubkey: reaction.pubkey,
                        authorMetadata
                    };
                }
            }));
            setFeedbackList(feedbacks);
            setIsOpen(true);
        } else {
            setIsOpen(false);
            setFeedbackList([]);
        }
    };

    return (
        <div onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}>
            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex flex-row items-center space-x-2 hover:bg-surface-2">
                        <div className="flex items-center">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="relative">
                                    <Star className="w-4 h-4 text-ink-3/40" />
                                    <div
                                        className="absolute inset-0 overflow-hidden"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, (parseFloat(app.avgRating) - i) * 100))}%`
                                        }}
                                    >
                                        <Star className="w-4 h-4 text-amber-strong fill-amber-strong" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <span className="font-medium">{app.avgRating}</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto border-ink/15 bg-chrome text-ink">
                    <DialogHeader>
                        <DialogTitle>Ratings & Feedback for {app.appName}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        {feedbackList.map((feedback, index) => (
                            <div key={index} className="border border-ink/10 bg-surface rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-amber-soft text-amber-strong text-xs">
                                                {feedback.authorMetadata?.name?.[0]?.toUpperCase() || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium">{feedback.authorMetadata?.name || 'Anonymous'}</span>
                                    </div>
                                    <div className="flex items-center">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`w-4 h-4 ${i < feedback.rating ? 'text-amber-strong fill-amber-strong' : 'text-ink-3/40'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                {feedback.feedback && (
                                    <p className="text-ink-3 mt-2">{feedback.feedback}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
