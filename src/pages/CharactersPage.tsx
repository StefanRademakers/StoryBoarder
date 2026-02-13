import type { ProjectState } from "../state/types";
import { FolderImageBoardsPage } from "./FolderImageBoardsPage";

interface CharactersPageProps {
  project: ProjectState;
}

export function CharactersPage({ project }: CharactersPageProps) {
  return (
    <FolderImageBoardsPage
      project={project}
      folderName="characters"
      pageTitle="Character & Props"
      sectionTitle="Organize visual references for characters and props."
      singularLabel="Board"
    />
  );
}
