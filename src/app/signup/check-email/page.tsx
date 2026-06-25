import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CheckEmailPageProps = {
  searchParams: Promise<{ email?: string | string[] }>;
};

export default async function CheckEmailPage({
  searchParams,
}: CheckEmailPageProps) {
  const { email } = await searchParams;
  const emailAddress = typeof email === "string" ? email : "your email";

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link className="text-lg font-semibold" href="/">
          Nestify
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md rounded-lg">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MailCheck className="size-5" />
            </div>
            <CardTitle className="text-2xl">Verify your email</CardTitle>
            <CardDescription>
              We sent a secure sign-in link to {emailAddress}. Open that email
              to confirm your account and continue home setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>
              After you click the verification link, Nestify will bring you
              back to a guided setup flow where you can add the home details
              that make your dashboard useful.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/login">Go to login</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signup">Use a different email</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
