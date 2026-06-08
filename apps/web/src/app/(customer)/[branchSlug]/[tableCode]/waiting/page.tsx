"use client";
/* eslint-disable react-hooks/todo, react-hooks/set-state-in-effect */

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useCustomerStore } from "@/stores/customer-store";
import { useWebSocket } from "@/hooks/use-websocket";
import type { WsMessage } from "@restai/types";
import { useTranslation } from "@/stores/lang-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function WaitingPage({
  params,
}: {
  params: Promise<{ branchSlug: string; tableCode: string }>;
}) {
  "use no memo";
  const { branchSlug, tableCode } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
  const sessionId = useCustomerStore((s) => s.sessionId);
  const token = useCustomerStore((s) => s.token);
  const [status, setStatus] = useState<"pending" | "active" | "rejected">("pending");
  const [error, setError] = useState<string | null>(null);

  const pollSessionStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/customer/${branchSlug}/${tableCode}/session-status/${sessionId}`,
      );
      const result = await res.json();
      if (result.success) {
        setStatus(result.data.status);
        if (result.data.status === "active") {
          router.push(`/${branchSlug}/${tableCode}/menu`);
        }
      }
    } catch {
      setError(t("customer.errorVerifyingStatus"));
    }
  }, [sessionId, branchSlug, tableCode, router, t]);

  useWebSocket(
    sessionId ? [`session:${sessionId}`] : [],
    (msg: WsMessage) => {
      if (msg.type === "session:approved") {
        setStatus("active");
        router.push(`/${branchSlug}/${tableCode}/menu`);
      } else if (msg.type === "session:rejected") {
        setStatus("rejected");
      }
    },
    token || undefined,
  );

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(pollSessionStatus, 15000);
    return () => clearInterval(interval);
  }, [sessionId, pollSessionStatus]);

  if (!sessionId) {
    return (
      <div className="p-4 mt-8 text-center">
        <p className="text-muted-foreground mb-4">{t("customer.noSessionFound")}</p>
        <Button variant="outline" onClick={() => router.push(`/${branchSlug}/${tableCode}`)}>
          {t("customer.backToStart")}
        </Button>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="p-4 mt-8">
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t("customer.requestRejected")}</h2>
            <p className="text-muted-foreground mb-6">
              {t("customer.requestRejectedDesc")}
            </p>
            <Button onClick={() => router.push(`/${branchSlug}/${tableCode}`)}>
              {t("customer.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 mt-8">
      <Card>
        <CardContent className="py-12 text-center">
          <div className="relative mx-auto mb-6 w-20 h-20">
            <Clock className="h-20 w-20 text-primary/20" />
            <Loader2 className="h-10 w-10 text-primary animate-spin absolute top-5 left-5" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t("customer.waitingConfirmation")}</h2>
          <p className="text-muted-foreground mb-2">
            {t("customer.waitingConfirmationDesc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("connections.table")} {tableCode}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
