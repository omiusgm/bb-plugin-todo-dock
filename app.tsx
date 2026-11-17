import { definePluginApp, type ExperimentalSidebarFooterDisclosureProps } from "@get-bb/plugin-sdk/app";
import { AvatarOverlay } from "./avatars";
import { AvatarSettings } from "./avatar-settings";
import { GoalsView, useGoalsBadge } from "./goals";

function TodoDock({ dismiss }: ExperimentalSidebarFooterDisclosureProps) {
  return <GoalsView compact dismiss={dismiss} />;
}
function GoalsPage() {
  return <div className="h-full overflow-y-auto p-4 md:p-5"><div className="mx-auto w-full max-w-3xl"><GoalsView /></div></div>;
}
export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "avatars", component: AvatarOverlay });
  app.slots.settingsSection({ id: "avatars", title: "Питомцы", component: AvatarSettings });
  app.experimental_sidebarFooter.register({ kind: "disclosure", id: "todo-dock", label: "Задачи агентов и мои", icon: "ListTodo", component: TodoDock });
  app.slots.navPanel({ id: "goals", title: "Цели", icon: "ListTodo", path: "goals", component: GoalsPage, experimental_useBadge: useGoalsBadge });
});
