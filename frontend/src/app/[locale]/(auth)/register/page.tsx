"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const { user, isLoading, register: registerUser } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/home");
    }
  }, [isLoading, user, router]);

  const onSubmit = async (values: RegisterValues) => {
    setIsSubmitting(true);
    try {
      await registerUser(values.email, values.password, locale);
      toast.success(t("success"));
      router.push("/home");
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{t("emailInvalid")}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{t("passwordTooShort")}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
            <Link href="/login" className="underline">
              {t("loginLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
