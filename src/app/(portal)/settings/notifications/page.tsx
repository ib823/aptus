import { NotificationPreferencesGrid } from "@/components/notifications/NotificationPreferencesGrid";

export default function NotificationSettingsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification Preferences</h1>
        <p className="text-muted-foreground mt-1">
          Choose how you want to be notified for each event type.
        </p>
      </div>

      <div className="bg-card rounded-lg border">
        <NotificationPreferencesGrid />
      </div>
    </div>
  );
}
