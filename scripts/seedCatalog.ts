/**
 * seedCatalog.ts
 * Seeds all categories and subcategories into MongoDB.
 * After running, it prints out the mapping of mock IDs → real MongoDB _ids
 * so the frontend mockData.ts can be updated accordingly.
 */
import mongoose from 'mongoose';
import { Category } from '../src/models/Category';
import { Subcategory } from '../src/models/Subcategory';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/printoday';

// ─── Category definitions ────────────────────────────────────────────────────
const CATEGORIES = [
  {
    key: 'cat-wedding',
    name: 'Wedding Essentials',
    slug: 'wedding-essentials',
    description: 'All kinds of Wedding Invitation Cards, Menus, Decor, & Management.',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
    iconName: 'Sparkles'
  },
  {
    key: 'cat-brand',
    name: 'Brand Marketing & Events',
    slug: 'brand-marketing-events',
    description: 'Banners, Flyers, Promo Tables, Canopies, T-Shirts & Full Event Management.',
    image: 'https://images.unsplash.com/photo-1542744094-3a3121699479?auto=format&fit=crop&w=800&q=80',
    iconName: 'Megaphone'
  },
  {
    key: 'cat-business',
    name: 'All About Business & Office',
    slug: 'business-office',
    description: 'Visiting Cards, Letterheads, Bill Books, Stamps, ID Cards & Packaging.',
    image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
    iconName: 'Briefcase'
  },
  {
    key: 'cat-personal',
    name: 'Personal Gifts',
    slug: 'personal-gifts',
    description: 'Photo Frames, Customized Mugs, Cushions, T-Shirts & Personalized Notebooks.',
    image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80',
    iconName: 'Gift'
  }
];

// ─── Subcategory definitions ─────────────────────────────────────────────────
const SUBCATEGORIES: { key: string; categoryKey: string; name: string }[] = [
  // Wedding Essentials
  ...['Invitation Card', 'Wedding Itinerary', 'Thank You Card', 'Welcome Board', 'Wedding Menu',
    'Sticker', 'Hamper', 'Gifts', 'Flower Car Decor', 'Totto Decor', 'All Types of Decoration',
    'Sound System', 'Guest Welcoming Service', 'Hospitality Team', 'Full Event Planning & Management'
  ].map((name, i) => ({ key: `sub-wedding-${i}`, categoryKey: 'cat-wedding', name })),

  // Brand Marketing & Events
  ...['Posters', 'Banner', 'Flyers / Handbills / Leaflets', 'Brochures', 'Booklet', 'Sticker', 'Standee',
    'Promo Table', 'Canopy Tent', 'All Types of Branding', 'Marketing / Brand Activation', 'Custom T-Shirts & Caps',
    'Custom Paper Bags', 'Custom Paper Cups', 'Custom Water Bottle', 'Table Cover', 'Table Runner',
    'Invitation / Welcome / Thank You Letter', 'Custom Envelope', 'Inauguration Stalls', 'Memento',
    'Sound System', 'Management Team', 'Full Event Management'
  ].map((name, i) => ({ key: `sub-brand-${i}`, categoryKey: 'cat-brand', name })),

  // Business & Office
  ...['Visiting Card', 'Letterhead / Letter Card', 'Bill Book', 'Stamps', 'Diaries', 'Nameplate',
    'Sign Board', 'Customized Packaging', 'All Stationery Items'
  ].map((name, i) => ({ key: `sub-business-${i}`, categoryKey: 'cat-business', name })),

  // Personal Gifts
  ...['Photo Frame', 'Personalized Mugs', 'Customized Planters', 'Personalized Diary',
    'Personalized Notebook', 'Personalized Calendar', 'Cushions', 'Customized Bag', 'T-Shirt'
  ].map((name, i) => ({ key: `sub-personal-${i}`, categoryKey: 'cat-personal', name }))
];

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB connected');

  // Track key → _id mappings for frontend update
  const catIdMap: Record<string, string> = {};
  const subIdMap: Record<string, string> = {};

  // ── Seed Categories ──────────────────────────────────────────────────────────
  console.log('\n📦 Seeding categories...');
  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ slug: cat.slug });
    if (existing) {
      catIdMap[cat.key] = existing._id.toString();
      console.log(`  [SKIP] ${cat.name} — already exists (${existing._id})`);
    } else {
      const created = await Category.create({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        iconName: cat.iconName
      });
      catIdMap[cat.key] = created._id.toString();
      console.log(`  [NEW]  ${cat.name} → ${created._id}`);
    }
  }

  // ── Seed Subcategories ───────────────────────────────────────────────────────
  console.log('\n📦 Seeding subcategories...');
  for (const sub of SUBCATEGORIES) {
    const baseSlug = sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const catPrefix = sub.categoryKey.replace('cat-', '');
    const slug = `${catPrefix}-${baseSlug}`;
    const categoryId = catIdMap[sub.categoryKey];

    // Find by name+categoryId (slug may have been stored differently previously)
    const existing = await Subcategory.findOne({ name: sub.name, categoryId });
    if (existing) {
      subIdMap[sub.key] = existing._id.toString();
      console.log(`  [SKIP] ${sub.name} (${existing._id})`);
    } else {
      const created = await Subcategory.create({ categoryId, name: sub.name, slug });
      subIdMap[sub.key] = created._id.toString();
      console.log(`  [NEW]  ${sub.name} → ${created._id}`);
    }
  }

  // ── Print mapping for frontend ───────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(70));
  console.log('COPY THIS OUTPUT INTO client/src/data/mockData.ts');
  console.log('='.repeat(70));

  console.log('\n// ── CATEGORY IDs (replace the id fields in MOCK_CATEGORIES) ──');
  for (const [key, id] of Object.entries(catIdMap)) {
    console.log(`// ${key}  →  "${id}"`);
  }

  console.log('\n// ── SUBCATEGORY IDs (replace the id fields in MOCK_SUBCATEGORIES) ──');
  for (const [key, id] of Object.entries(subIdMap)) {
    console.log(`// ${key}  →  "${id}"`);
  }

  console.log('\n// ── UPDATED MOCK_CATEGORIES ARRAY ──');
  console.log('export const MOCK_CATEGORIES: Category[] = [');
  for (const cat of CATEGORIES) {
    const id = catIdMap[cat.key];
    console.log(`  { id: '${id}', name: '${cat.name}', slug: '${cat.slug}', description: '${cat.description}', image: '${cat.image}', iconName: '${cat.iconName}', productCount: 0 },`);
  }
  console.log('];\n');

  console.log('// ── UPDATED MOCK_SUBCATEGORIES ARRAY ──');
  console.log('export const MOCK_SUBCATEGORIES: Subcategory[] = [');
  for (const sub of SUBCATEGORIES) {
    const id = subIdMap[sub.key];
    const catId = catIdMap[sub.categoryKey];
    const slug = sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    console.log(`  { id: '${id}', categoryId: '${catId}', name: '${sub.name}', slug: '${slug}', description: '', image: '' },`);
  }
  console.log('];');

  console.log('\n' + '='.repeat(70));

  await mongoose.disconnect();
  console.log('\n✅ Done! Update mockData.ts with the above arrays.');
  process.exit(0);
};

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
