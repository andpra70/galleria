export type InitialGalleryProject = Readonly<{
  id: string;
  name: string;
  directory: string;
  templatePath: string;
}>;

export const INITIAL_GALLERY_PROJECT: InitialGalleryProject = Object.freeze({
  id: "progetto",
  name: "progetto",
  directory: "galleria",
  templatePath: "config/gallery.json",
});
