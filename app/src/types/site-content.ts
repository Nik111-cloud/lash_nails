/** Public editorial content only. Administration credentials never belong here. */
export interface OrderedItem {
  id: string;
  sort: number;
  archived: boolean;
}

export interface ImageFields {
  image_path: string;
  image_file: string | { id: string; width?: number; height?: number; modified_on?: string | null } | null;
  image_alt: string;
  image_width: number;
  image_height: number;
}

export interface SiteSettings {
  brand_name: string;
  brand_subtitle: string;
  booking_url: string;
  phone: string;
  phone_display: string;
  whatsapp_url: string;
  address: string;
  hours: string;
  map_embed_url: string;
  map_org_url: string;
  map_org_label: string;
  map_category_url: string;
  map_category_label: string;
  seo_title: string;
  seo_description: string;
  og_title: string;
  og_description: string;
  canonical_url: string;
  policy_seo_title: string;
  policy_seo_description: string;
  policy_date: string;
  policy_date_label: string;
}

export interface SiteText {
  key: string;
  group: string;
  title: string;
  value: string;
}

export interface HeroSlide extends OrderedItem, ImageFields {
  eyebrow: string;
  title: string;
  title_secondary: string;
  description: string;
  description_secondary: string;
  cta_label: string;
  booking_url: string;
}

/** Starting prices are shared by cards and the calculator. */
export interface Service extends OrderedItem {
  key: string;
  slug: string;
  title: string;
  description: string;
  price_from: number;
  duration_label: string;
  booking_url: string;
  background_path: string;
  background_file: string | { id: string; width?: number; height?: number; modified_on?: string | null } | null;
  calculator_enabled: boolean;
  calculator_label: string;
  calculator_checked: boolean;
  calculator_sort: number;
}

export interface LashEffect extends OrderedItem, ImageFields {
  title: string;
  badge: string;
  description: string;
}

export interface PhotoItem extends OrderedItem, ImageFields {}

export interface PortfolioItem extends PhotoItem {
  caption?: string;
}

export interface Master extends OrderedItem, ImageFields {
  title: string;
  features: string[];
  booking_url: string;
}

/** Only procedure variants belong here; ordinary service prices live in services. */
export interface CalculatorOption extends OrderedItem {
  key: string;
  title: string;
  price_from: number;
  service_slug: string;
}

export interface TextSegment {
  text: string;
  href?: string;
  strong?: boolean;
}

export type PolicyBlock =
  | { type: 'paragraph'; segments: TextSegment[] }
  | { type: 'list'; items: TextSegment[][] };

export interface PolicySection extends OrderedItem {
  slug: string;
  title: string;
  toc_title: string;
  blocks: PolicyBlock[];
}

export interface SiteContent {
  site_settings: SiteSettings;
  site_texts: SiteText[];
  hero_slides: HeroSlide[];
  services: Service[];
  lash_effects: LashEffect[];
  portfolio_items: PortfolioItem[];
  review_items: PhotoItem[];
  masters: Master[];
  studio_photos: PhotoItem[];
  calculator_options: CalculatorOption[];
  policy_sections: PolicySection[];
}
