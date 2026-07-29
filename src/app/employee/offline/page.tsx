import { OfflineFieldView } from "@/components/employee/OfflineFieldView";

export const dynamic = "force-static";

export default function EmployeeOfflinePage() {
  return (
    <main className="page-shell employee-shell">
      <OfflineFieldView />
    </main>
  );
}
