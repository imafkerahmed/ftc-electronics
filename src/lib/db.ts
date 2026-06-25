import { Product, Category } from '../types/product';

// A mock products database representing FTC Electronics catalog
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_1',
    name: 'ApexBook Pro 16"',
    slug: 'apexbook-pro-16',
    description: 'High-performance laptop for developers, creators, and professionals. Features the latest M4 Max processor, 32GB unified memory, and 1TB ultra-fast SSD storage. The stunning 16-inch Liquid Retina XDR display makes every pixel pop.',
    price: 2499,
    discountPrice: 2299,
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop'],
    category: 'Laptops',
    brand: 'Apex',
    specs: {
      CPU: 'Apex M4 Max (16-Core)',
      Memory: '32GB Unified RAM',
      Storage: '1TB PCIe NVMe SSD',
      Display: '16.2" Mini-LED (120Hz, 3456 x 2234)',
      Battery: 'Up to 22 hours',
      Weight: '4.7 lbs (2.1 kg)'
    },
    rating: 4.9,
    numReviews: 124,
    countInStock: 15,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_2',
    name: 'Phonix Pro 15 Ultra',
    slug: 'phonix-pro-15-ultra',
    description: 'Next-generation flagship smartphone with a revolutionary 200MP camera system, 5x optical zoom, and titanium alloy chassis. Driven by the Snapdragon 8 Gen 3 chipset and features a gorgeous 6.8-inch Dynamic AMOLED screen.',
    price: 1199,
    images: ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600&auto=format&fit=crop'],
    category: 'Phones',
    brand: 'Phonix',
    specs: {
      Processor: 'Snapdragon 8 Gen 3',
      Screen: '6.8" AMOLED (120Hz, QHD+)',
      Memory: '12GB LPDDR5X',
      Storage: '256GB UFS 4.0',
      Camera: '200MP Main + 50MP Zoom + 12MP Ultra-wide',
      Battery: '5000 mAh (45W fast charge)'
    },
    rating: 4.8,
    numReviews: 89,
    countInStock: 25,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_3',
    name: 'Acoustic-X ANC Headphones',
    slug: 'acoustic-x-anc-headphones',
    description: 'Premium over-ear wireless headphones with industry-leading Active Noise Cancellation (ANC), ambient sound transparency mode, and high-fidelity custom-engineered 40mm drivers. Enjoy 40 hours of playtime on a single charge.',
    price: 349,
    discountPrice: 299,
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop'],
    category: 'Audio',
    brand: 'Acoustic',
    specs: {
      Type: 'Over-Ear Wireless',
      Drivers: '40mm Neodymium Dynamic',
      Connectivity: 'Bluetooth 5.3 & 3.5mm Wired',
      'Battery Life': 'Up to 40 Hours (ANC On)',
      Codecs: 'LDAC, AAC, SBC',
      Weight: '250g'
    },
    rating: 4.7,
    numReviews: 242,
    countInStock: 40,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_4',
    name: 'KeyForge Q1 Mechanical Keyboard',
    slug: 'keyforge-q1-mechanical-keyboard',
    description: 'Fully customizable, 75% layout mechanical keyboard with a solid CNC aluminum body, hot-swappable switches, and double-gasket design. Fitted with pre-lubed linear switches and double-shot PBT keycaps for a deep, satisfying acoustic profile.',
    price: 189,
    images: ['https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=600&auto=format&fit=crop'],
    category: 'Keyboards',
    brand: 'KeyForge',
    specs: {
      Layout: '75% (82 keys)',
      Case: 'CNC Anodized Aluminum',
      Switches: 'KeyForge Linear Red (Hot-swappable)',
      Keycaps: 'Double-shot PBT Cherry Profile',
      Backlight: 'South-facing RGB',
      Connection: 'USB Type-C wired'
    },
    rating: 4.6,
    numReviews: 76,
    countInStock: 8,
    isFeatured: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_5',
    name: 'VisionGlide 34" Curved Monitor',
    slug: 'visionglide-34-curved-monitor',
    description: 'Ultra-wide 34-inch curved monitor engineered for immersive gaming and maximum productivity. Highlights an ultrawide WQHD panel with 165Hz refresh rate, 1ms response time, and 99% sRGB color gamut coverage.',
    price: 549,
    discountPrice: 499,
    images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600&auto=format&fit=crop'],
    category: 'Laptops', // Categorized broadly or cataloged
    brand: 'VisionGlide',
    specs: {
      Size: '34" diagonal (1500R curvature)',
      Resolution: 'WQHD (3440 x 1440)',
      'Refresh Rate': '165Hz',
      Panel: 'VA Panel (HDR400)',
      Inputs: '2x HDMI 2.0, 2x DisplayPort 1.4, 1x USB-C (90W PD)',
      Response: '1ms MPRT'
    },
    rating: 4.5,
    numReviews: 53,
    countInStock: 12,
    isFeatured: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_6',
    name: 'Xiaomi Robot Vacuum H40 (Global Version)',
    slug: 'xiaomi-robot-vacuum-h40',
    description: 'Anti-tangle vacuuming/mopping with large-capacity dust collection. Automatically navigates and sweeps your home with premium precision.',
    price: 184990,
    discountPrice: 155000,
    images: [
      'https://images.unsplash.com/photo-1618346136472-090de27fe8b4?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1518310383802-640c2de311b2?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Vacuum Cleaners',
    brand: 'Xiaomi',
    specs: {
      Navigation: 'Laser LDS Navigation',
      Suction: '4000Pa Powerful Suction',
      Dustbin: 'Large 600ml Dustbin',
      Battery: '5200mAh Capacity',
      Features: 'Anti-Tangle Brush, Auto-Empty Station'
    },
    rating: 4.8,
    numReviews: 24,
    countInStock: 5,
    isPreOrder: true,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_7',
    name: 'Anker MagGo Power Bank (10K, Slim) – A1664',
    slug: 'anker-maggo-power-bank-10k',
    description: 'Sleek and compact 10,000mAh magnetic power bank with MagSafe support and fast USB-C bi-directional charging.',
    price: 23500,
    discountPrice: 21500,
    images: [
      'https://images.unsplash.com/photo-1609592424109-dd9f565d71c3?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Power Banks',
    brand: 'Anker',
    specs: {
      Capacity: '10,000 mAh',
      Technology: 'MagSafe Compatible Qi2 Wireless Charging',
      Output: 'Max 15W Wireless, 20W Wired',
      Design: 'Ultra-Slim Pocketable Design',
      Display: 'Smart LED Status Lights'
    },
    rating: 4.9,
    numReviews: 14,
    countInStock: 20,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_8',
    name: 'Eufy X10 Pro Omni Robot Vacuum Cleaner – T2351',
    slug: 'eufy-x10-pro-omni',
    description: 'All-in-one robotic vacuum cleaner with active mop washing, self-emptying, auto-refilling, and 8000Pa powerful suction.',
    price: 319000,
    discountPrice: 299990,
    images: [
      'https://images.unsplash.com/photo-1569698206670-12d20d4000d5?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1589652717521-10c341494de3?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Vacuum Cleaners',
    brand: 'Eufy',
    specs: {
      Suction: '8000Pa Bi-Directional Suction',
      Base: 'Omni Station Self-Cleaning & Auto-Emptying',
      Mop: 'Dual-Rotational Active Mopping System',
      Navigation: 'AI.See Obstacle Avoidance & 3D Mapping',
      Warranty: '1 Year Brand Warranty'
    },
    rating: 4.7,
    numReviews: 32,
    countInStock: 8,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_9',
    name: 'Eufy Smart Track Card – T87B2',
    slug: 'eufy-smart-track-card',
    description: 'Ultra-thin card-shaped smart tracker that works with Apple Find My network to keep track of your wallet, bags, and valuables.',
    price: 9990,
    discountPrice: 9490,
    images: [
      'https://images.unsplash.com/photo-1627252879515-d2206173dd09?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Accessories',
    brand: 'Eufy',
    specs: {
      Thickness: '2.4mm Card Thickness',
      Compatibility: 'Official Apple Find My Network',
      Battery: 'Non-replaceable (up to 3 years life)',
      Waterproof: 'IPX7 Water Resistant',
      Sound: '90dB loud ring'
    },
    rating: 5.0,
    numReviews: 1,
    countInStock: 15,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_10',
    name: 'Xiaomi Ballpoint Pen – White (10-Pack)',
    slug: 'xiaomi-ballpoint-pen-white',
    description: 'Simple and elegant gel ink ballpoint pens featuring a smooth-writing 0.5mm tip and high-quality imported Japanese ink.',
    price: 3500,
    images: [
      'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1585336139080-b019f0b2f816?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Writing Instruments',
    brand: 'Xiaomi',
    specs: {
      Pack: '10 Pens per Pack',
      Ink: 'Japanese Mikuni Quick-Dry Ink',
      Tip: '0.5mm Swiss Premec Precision Tip',
      Color: 'White Body, Black Ink'
    },
    rating: 4.6,
    numReviews: 8,
    countInStock: 50,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_11',
    name: 'Xiaomi High-Capacity Color Gel Pen (5-Pack) – Coloured',
    slug: 'xiaomi-color-gel-pen-5pack',
    description: 'High-capacity colored gel pens featuring a vibrant set of 5 distinct colors for drawing, journaling, and annotation.',
    price: 2450,
    images: [
      'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Writing Instruments',
    brand: 'Xiaomi',
    specs: {
      Pack: '5 Pens (Vibrant Colors)',
      Features: 'High Capacity (4x regular write length)',
      Tip: '0.5mm Precision Tip',
      Ink: 'Pigment-based Quick-Dry Non-fading Ink'
    },
    rating: 4.8,
    numReviews: 12,
    countInStock: 30,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_12',
    name: 'WiWU Skin Armor Laptop Sleeve',
    slug: 'wiwu-skin-armor-laptop-sleeve',
    description: 'Ultra-tough, water-resistant laptop sleeve with 360-degree shock-absorbing corner armor protection for MacBook and notebooks.',
    price: 5500,
    images: [
      'https://images.unsplash.com/photo-1625766763788-95dcce9bf5ac?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Sleeves',
    brand: 'WiWU',
    specs: {
      Material: 'Waterproof Ballistic Nylon & TPU',
      Protection: 'CornerArmor Shockproof Cushioning',
      Closure: 'YKK Premium Zippers',
      Design: 'Minimalist Protective Sleeve'
    },
    rating: 4.5,
    numReviews: 6,
    countInStock: 12,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_13',
    name: 'WiWU Skin Zero Ultra-Thin Laptop Sleeve',
    slug: 'wiwu-skin-zero-sleeve',
    description: 'Minimalist skin-tight soft sleeve that adds zero bulk while shielding your device from scratches and minor drops.',
    price: 4990,
    images: [
      'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Sleeves',
    brand: 'WiWU',
    specs: {
      Material: 'Lycra/Neoprene soft-stretch blend',
      Thickness: 'Less than 4mm thick',
      Lining: 'Scratch-resistant velvet interior',
      Compatibility: 'MacBook Air/Pro 13" - 14"'
    },
    rating: 4.7,
    numReviews: 18,
    countInStock: 3,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_14',
    name: 'WiWU Minimalis Travel Pouch',
    slug: 'wiwu-minimalis-travel-pouch',
    description: 'Sleek travel organizer pouch for power bricks, adapters, mouse, cables, and SSDs. Water-resistant material with leather handle.',
    price: 4500,
    images: [
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Pouches',
    brand: 'WiWU',
    specs: {
      Material: 'Water-resistant polyester + Eco Leather Handle',
      Dividers: 'Multiple mesh pockets & elastic slots',
      Dimensions: '22 x 14.5 x 6 cm',
      Weight: '150g'
    },
    rating: 4.8,
    numReviews: 19,
    countInStock: 22,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_15',
    name: 'Xiaomi UniBlade Trimmer Replacement Head',
    slug: 'xiaomi-uniblade-trimmer-head',
    description: 'Precision replacement blade head for Xiaomi UniBlade trimmer. Features skin-friendly dual-direction cutting.',
    price: 4500,
    images: [
      'https://images.unsplash.com/photo-1621607512214-68297480165e?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Personal Care',
    brand: 'Xiaomi',
    specs: {
      Blade: 'Dual-sided cutting edge + central shaver',
      Material: 'High-durability stainless steel',
      Compatibility: 'Xiaomi UniBlade Trimmer'
    },
    rating: 4.4,
    numReviews: 4,
    countInStock: 15,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_16',
    name: 'Xiaomi Water Flosser Replacement Tips',
    slug: 'xiaomi-water-flosser-tips',
    description: 'Pack of 2 replacement nozzles for the Xiaomi Mijia electric water flosser. Standard 0.6mm micro-bubble flow.',
    price: 5990,
    images: [
      'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Personal Care',
    brand: 'Xiaomi',
    specs: {
      Material: 'FDA-approved food-safe clear PC material',
      TipSize: '0.6mm precision jet tip',
      PackSize: '2x Replacement Tips'
    },
    rating: 4.6,
    numReviews: 9,
    countInStock: 25,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_17',
    name: 'Xiaomi Dust Mite Vacuum Cleaner 2 Pro Filter (2-Pack)',
    slug: 'xiaomi-dust-mite-filter-2pack',
    description: 'High efficiency HEPA replacement filters for Xiaomi Dust Mite Vacuum Cleaner. Traps 99.97% of allergens and fine dust.',
    price: 5990,
    images: [
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1509395062183-67c5ad6faff9?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Vacuum Cleaners',
    brand: 'Xiaomi',
    specs: {
      FilterType: 'HEPA High-Efficiency filtration',
      Efficiency: '99.97% particle capture',
      PackSize: '2x HEPA Filters',
      Compatibility: 'Xiaomi Dust Mite Vacuum Cleaner 2 Pro'
    },
    rating: 4.7,
    numReviews: 5,
    countInStock: 14,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_18',
    name: 'Xiaomi Smart Air Purifier 4 (Global Version)',
    slug: 'xiaomi-smart-air-purifier-6',
    description: 'High efficiency three-in-one filtration system that covers up to 48m² area. Smart Alexa & Google Home assistant voice control.',
    price: 102000,
    images: [
      'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1618944847828-82e943c3dba7?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Air Purifiers',
    brand: 'Xiaomi',
    specs: {
      Coverage: 'Up to 48 m² effective CADR',
      Noise: 'Ultra-silent 32.1dB sleep mode',
      Smart: 'Mijia Smart App + Voice Control Integration',
      Filter: 'HEPA filter with active carbon layer'
    },
    rating: 4.8,
    numReviews: 42,
    countInStock: 8,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_19',
    name: 'Dyson HushJet Purifier Compact HJ10 (Global Version)',
    slug: 'dyson-hushjet-purifier-hj10',
    description: 'Advanced desktop air purifier with HEPA H13 filtration and custom blade-free airflow technology. Near-silent operation.',
    price: 199990,
    images: [
      'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Air Purifiers',
    brand: 'Dyson',
    specs: {
      Filter: 'HEPA H13 Sealed Air Purifier',
      Airflow: 'Air Multiplier technology (blade-free)',
      Warranty: '2 Years Manufacturer Warranty',
      Sensors: 'Automatic VOC & PM2.5 gas detection'
    },
    rating: 4.9,
    numReviews: 12,
    countInStock: 2,
    isPreOrder: true,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_20',
    name: 'Dyson Purifier Cool Air Purifier PC2 De-NOx TP12',
    slug: 'dyson-purifier-cool-tp12',
    description: 'Premium floor-standing smart air purifying fan. Specifically traps gases, odors, and VOCs with its De-NOx carbon filter layer.',
    price: 225000,
    images: [
      'https://images.unsplash.com/photo-1614292244591-6c5c3c84e1b5?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Air Purifiers',
    brand: 'Dyson',
    specs: {
      Filter: 'HEPA H13 + Catalytic Formaldehyde destruction filter',
      Oscillation: '350 degrees wide oscillation',
      Connectivity: 'Dyson Link App Integration',
      Display: 'LCD Real-time Air Quality Monitor'
    },
    rating: 5.0,
    numReviews: 1,
    countInStock: 7,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_21',
    name: 'Xiaomi Smart Pet Care Air Purifier (Global Version)',
    slug: 'xiaomi-smart-pet-care-air-purifier',
    description: 'Specifically optimized air purifier designed to filter pet hair, dander, and eliminate litterbox odors with high absorption.',
    price: 52500,
    images: [
      'https://images.unsplash.com/photo-1548767797-d8c844163c4c?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Air Purifiers',
    brand: 'Xiaomi',
    specs: {
      Optimized: 'Wide grid mesh for pet hair & fine dander capture',
      OdorControl: 'Enhanced activated carbon for VOC & ammonia/sulfur control',
      Smart: 'Mijia App Integration + Automations'
    },
    rating: 4.7,
    numReviews: 16,
    countInStock: 11,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_22',
    name: 'IVON Dual-Port USB Fast Charger (IV-65)',
    slug: 'ivon-dual-port-fast-charger',
    description: 'Supercharge your devices with the IVON Dual-Port Fast Charger. Featuring dual USB outputs with intelligent power distribution and advanced safety protection.',
    price: 4500,
    discountPrice: 3890,
    images: [
      'https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Accessories',
    brand: 'IVON',
    specs: {
      Ports: 'Dual USB-A Ports',
      Input: '100-240V ~ 50/60Hz 0.5A',
      Output: '5V=3A / 9V=2A / 12V=1.5A (QC 3.0 compatible)',
      Safety: 'Short-circuit, over-charging, and thermal protection',
      Design: 'Compact travel-friendly folding design'
    },
    rating: 4.8,
    numReviews: 15,
    countInStock: 20,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_23',
    name: 'IVON Braided USB-C Fast Data Cable (IV-22)',
    slug: 'ivon-braided-usb-c-cable',
    description: 'Ultra-durable double-braided nylon charging and data synchronization cable. Built with premium reinforced SR joints to withstand heavy daily use.',
    price: 2200,
    discountPrice: 1750,
    images: [
      'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Accessories',
    brand: 'IVON',
    specs: {
      Interface: 'USB-A to USB Type-C',
      Length: '1.2 Meters (4 Feet)',
      Material: 'High-Density Double Braided Nylon + Aluminum Alloy Shell',
      Speed: 'Up to 480 Mbps high-speed data transfer',
      Current: 'Supports up to 3.0A fast charging'
    },
    rating: 4.7,
    numReviews: 24,
    countInStock: 35,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_24',
    name: 'IVON True Wireless ANC Earbuds (IV-X9)',
    slug: 'ivon-true-wireless-anc-earbuds',
    description: 'Experience pure acoustic clarity and powerful bass. IVON wireless earbuds feature Active Noise Cancellation, voice assistant support, and comfort-fit ergonomics.',
    price: 9990,
    discountPrice: 8490,
    images: [
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?q=80&w=600&auto=format&fit=crop'
    ],
    category: 'Audio',
    brand: 'IVON',
    specs: {
      Connectivity: 'Bluetooth v5.3 Auto-Pairing',
      NoiseControl: 'Active Noise Cancellation (ANC) + Transparency Mode',
      Drivers: '10mm Dynamic Bass Drivers',
      Battery: 'Up to 6 hours playtime per charge (28 hours total with case)',
      Controls: 'Smart Touch Gestures'
    },
    rating: 4.6,
    numReviews: 8,
    countInStock: 12,
    currency: 'LKR',
    createdAt: new Date().toISOString()
  }
];

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat_1', name: 'Laptops', slug: 'laptops', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=300', count: 12 },
  { id: 'cat_2', name: 'Phones', slug: 'phones', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=300', count: 20 },
  { id: 'cat_3', name: 'Audio', slug: 'audio', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=300', count: 15 },
  { id: 'cat_4', name: 'Keyboards', slug: 'keyboards', image: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=300', count: 8 },
  { id: 'cat_5', name: 'Vacuum Cleaners', slug: 'vacuum-cleaners', image: 'https://images.unsplash.com/photo-1618346136472-090de27fe8b4?q=80&w=300', count: 5 },
  { id: 'cat_6', name: 'Air Purifiers', slug: 'air-purifiers', image: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=300', count: 4 }
];

// Helper database queries
export async function getProducts(filters?: {
  category?: string;
  search?: string;
}): Promise<Product[]> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  let products = [...MOCK_PRODUCTS];

  if (filters?.category) {
    products = products.filter(
      (p) => p.category.toLowerCase() === filters.category!.toLowerCase()
    );
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.brand.toLowerCase().includes(searchLower)
    );
  }

  return products;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const product = MOCK_PRODUCTS.find((p) => p.slug === slug);
  return product || null;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return MOCK_PRODUCTS.filter((p) => p.isFeatured);
}

export async function getCategories(): Promise<Category[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return MOCK_CATEGORIES;
}

export async function getCollectionProducts(
  collection: 'on-sale' | 'new-arrivals' | 'air-purifiers'
): Promise<Product[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const products = [...MOCK_PRODUCTS];

  if (collection === 'on-sale') {
    return products.filter((p) => p.discountPrice !== undefined && p.currency === 'LKR');
  } else if (collection === 'new-arrivals') {
    const newArrivalSlugs = [
      'xiaomi-ballpoint-pen-white',
      'xiaomi-color-gel-pen-5pack',
      'wiwu-skin-armor-laptop-sleeve',
      'wiwu-skin-zero-sleeve',
      'wiwu-minimalis-travel-pouch',
      'xiaomi-uniblade-trimmer-head',
      'xiaomi-water-flosser-tips',
      'xiaomi-dust-mite-filter-2pack'
    ];
    return products.filter((p) => newArrivalSlugs.includes(p.slug));
  } else if (collection === 'air-purifiers') {
    return products.filter((p) => p.category === 'Air Purifiers');
  }

  return [];
}
