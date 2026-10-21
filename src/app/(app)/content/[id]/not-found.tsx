import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function PostNotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={FileQuestion}
        title="Post not found"
        description="It may have been deleted, or it belongs to another workspace."
        action={
          <Button asChild size="sm">
            <Link href="/content">Back to the content library</Link>
          </Button>
        }
        className="py-14"
      />
    </Card>
  );
}
