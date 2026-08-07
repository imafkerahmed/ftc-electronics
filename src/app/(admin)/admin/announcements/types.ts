export interface Announcement {
  id: string;
  title: string;
  description?: string;
  image: string;
  link: string;
  isActive: boolean;
  endsAt: string;
  imageUrl?: string;
}
