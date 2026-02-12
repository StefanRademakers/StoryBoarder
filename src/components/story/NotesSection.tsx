import { LibrarySection } from "./LibrarySection";

interface NotesSectionProps {
  projectRoot: string;
}

export function NotesSection({ projectRoot }: NotesSectionProps) {
  return (
    <LibrarySection
      projectRoot={projectRoot}
      folderName="notes"
      title="Note"
      placeholder="Write your note..."
    />
  );
}
