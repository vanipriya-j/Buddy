import { ActivityForm } from "@/components/activity-form";

export default function NewActivityPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">New activity</h1>
      <ActivityForm />
    </div>
  );
}
