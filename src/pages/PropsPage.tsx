import type { ProjectState } from "../state/types";
import { FolderImageBoardsPage } from "./FolderImageBoardsPage";

interface PropsPageProps {
  project: ProjectState;
}

export function PropsPage({ project }: PropsPageProps) {
  return (
    <FolderImageBoardsPage
      project={project}
      folderName="props"
      pageTitle="Props"
      sectionTitle="Organize visual references per prop."
      singularLabel="Prop"
    />
  );
}
