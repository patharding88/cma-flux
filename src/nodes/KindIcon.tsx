import type { CSSProperties } from "react";
import {
  AppWindow,
  ArrowLeftToLine,
  ArrowRightFromLine,
  Building2,
  CirclePlay,
  FileText,
  Flag,
  GitBranch,
  Layers,
  ListTodo,
  Map as MapIcon,
  SquareDashed,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "../types";

const ICONS: Record<NodeKind, LucideIcon> = {
  start: CirclePlay,
  map: MapIcon,
  nest: SquareDashed,
  in: ArrowLeftToLine,
  out: ArrowRightFromLine,
  stage: Layers,
  task: ListTodo,
  decision: GitBranch,
  role: UserRound,
  application: AppWindow,
  automation: Zap,
  document: FileText,
  external: Building2,
  end: Flag,
};

export function KindIcon({
  kind,
  size = 14,
  style,
}: {
  kind: NodeKind;
  size?: number;
  style?: CSSProperties;
}) {
  const Icon = ICONS[kind] ?? ListTodo;
  return <Icon size={size} strokeWidth={1.75} style={style} />;
}
