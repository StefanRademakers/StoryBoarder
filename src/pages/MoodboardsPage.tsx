import type { ProjectState } from "../state/types";
import { FolderImageBoardsPage } from "./FolderImageBoardsPage";

interface MoodboardsPageProps {
  project: ProjectState;
}

export function MoodboardsPage({ project }: MoodboardsPageProps) {
  return (
    <FolderImageBoardsPage
      project={project}
      folderName="moodboards"
      pageTitle="Moodboards & Visual References - Images & Videos"
      sectionTitle="Organize visual references per moodboard."
      singularLabel="Moodboard"
    />
  );
}
