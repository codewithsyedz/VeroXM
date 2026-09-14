import ProjectNav from "./ProjectNav";

// Every route under /projects/:id (Model, Content, Media, Access, and the
// nested collection/content-editing pages) shares this layout, so the
// section band renders once here rather than being pasted into each page.
// It does NOT wrap /projects itself (the project list) — that route is a
// sibling segment, not a child of this one — matching the band's own
// premise that it only makes sense once you're inside a specific project.
export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;

  return (
    <>
      <ProjectNav projectId={projectId} />
      {children}
    </>
  );
}
