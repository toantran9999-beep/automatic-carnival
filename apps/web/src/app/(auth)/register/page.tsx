"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerOrgSchema, type RegisterOrgInput } from "@restai/validators";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/stores/lang-store";

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<RegisterOrgInput>({
    resolver: zodResolver(registerOrgSchema),
  });

  const orgName = watch("organizationName");

  const onOrgNameChange = (value: string) => {
    setValue("organizationName", value);
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setValue("slug", slug);
  };

  const onSubmit = async (data: RegisterOrgInput) => {
    try {
      setError(null);
      setLoading(true);
      await registerUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("register.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
          <span className="text-2xl font-bold text-primary-foreground">R</span>
        </div>
        <CardTitle className="text-2xl">{t("register.title")}</CardTitle>
        <CardDescription>
          {t("register.subtitle")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="organizationName">{t("register.orgNameLabel")}</Label>
            <Input
              id="organizationName"
              placeholder={t("register.orgNamePlaceholder")}
              {...register("organizationName")}
              onChange={(e) => onOrgNameChange(e.target.value)}
            />
            {errors.organizationName && (
              <p className="text-sm text-destructive">
                {errors.organizationName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">{t("register.slugLabel")}</Label>
            <Input
              id="slug"
              placeholder={t("register.slugPlaceholder")}
              {...register("slug")}
            />
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("register.nameLabel")}</Label>
            <Input
              id="name"
              placeholder={t("register.namePlaceholder")}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("register.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("register.emailPlaceholder")}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("register.passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("register.passwordPlaceholder")}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("register.loading") : t("register.button")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("register.hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("register.signIn")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
