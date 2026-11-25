/** Static site content: navigation, footer, trust copy, FAQs and social. */

export const ANNOUNCEMENTS = [
  { id: 'shipping', text: 'Complimentary Free Delivery Available', icon: 'truck' },
  { id: 'authentic', text: '100% Authentic Originals', icon: 'shield' },
  { id: 'oils', text: 'Up to 40% Oil Concentration', icon: 'sparkle' },
  { id: 'secure', text: 'Secure Encrypted Payment', icon: 'lock' },
]

export const MAIN_NAV = [
  { id: 'home', label: 'Home', to: '/' },
  {
    id: 'shop',
    label: 'Shop All',
    to: '/shop',
    children: [
      { id: 'bestsellers', label: 'Best Sellers', to: '/shop/best-sellers' },
      { id: 'new-arrivals', label: 'New Arrivals', to: '/shop/new-arrivals' },
      { id: 'original', label: 'Original Perfumes', to: '/shop/originals' },
      { id: 'inspired', label: 'Inspired Perfumes', to: '/shop/inspired' },
      { id: 'attars', label: 'Attar', to: '/shop/attars' },
      { id: 'celebrities', label: 'Celebrities Perfumes', to: '/shop/celebrities' },
      { id: 'combos', label: 'Gift Sets & Combos', to: '/combos' },
      { id: 'bakhoor', label: 'Bakhoor', to: '/shop/bakhoor' },
      { id: 'car-perfumes', label: 'Car Perfumes', to: '/shop/car-perfumes' },
      { id: 'men', label: 'Perfume for Men', to: '/shop/men' },
      { id: 'women', label: 'Perfume for Women', to: '/shop/women' },
      { id: 'unisex', label: 'Unisex', to: '/shop/unisex' },
      { id: 'view-all', label: 'View All', to: '/shop' },
    ],
  },
  { id: 'new-arrivals', label: 'New Arrivals', to: '/shop/new-arrivals' },
  { id: 'gift-sets', label: 'Gift Sets', to: '/combos' },
  { id: 'offers', label: 'Offers', to: '/offers', accent: 'red' },
]

export const MOBILE_NAV = [
  { id: 'home', label: 'Home', to: '/' },
  { id: 'shop', label: 'Shop All', to: '/shop' },
  { id: 'new-arrivals', label: 'New Arrivals', to: '/shop/new-arrivals' },
  { id: 'gift-sets', label: 'Gift Sets', to: '/combos' },
  { id: 'bestsellers', label: 'Best Sellers', to: '/shop/best-sellers' },
  { id: 'original', label: 'Original Perfumes', to: '/shop/originals' },
  { id: 'inspired', label: 'Inspired Perfumes', to: '/shop/inspired' },
  { id: 'attars', label: 'Attar', to: '/shop/attars' },
  { id: 'celebrities', label: 'Celebrities Perfumes', to: '/shop/celebrities' },
  { id: 'bakhoor', label: 'Bakhoor', to: '/shop/bakhoor' },
  { id: 'car-perfumes', label: 'Car Perfumes', to: '/shop/car-perfumes' },
  { id: 'offers', label: 'Offers', to: '/offers', accent: 'red' },
  { id: 'track', label: 'Track Order', to: '/track-order' },
  { id: 'wishlist', label: 'Wishlist', to: '/wishlist' },
  { id: 'account', label: 'My Account', to: '/account' },
]

export const FOOTER_COLUMNS = [
  {
    id: 'shop',
    title: 'Shop Collections',
    links: [
      { label: "Men's Perfumes", to: '/shop/men' },
      { label: "Women's Perfumes", to: '/shop/women' },
      { label: 'Unisex Signature', to: '/shop/unisex' },
      { label: 'Original Perfumes', to: '/shop/originals' },
      { label: 'Inspired Perfumes', to: '/shop/inspired' },
      { label: 'Attar', to: '/shop/attars' },
      { label: 'Celebrities Perfumes', to: '/shop/celebrities' },
      { label: 'Combo Sets', to: '/combos' },
      { label: 'Bakhoor', to: '/shop/bakhoor' },
      { label: 'Car Perfumes', to: '/shop/car-perfumes' },
    ],
  },
  {
    id: 'care',
    title: 'Contact Us',
    links: [
      { label: 'Track Order', to: '/track-order' },
      { label: 'Shipping Policy', to: '/pages/shipping-policy' },
      { label: 'No Return Policy', to: '/pages/return-refund' },
      { label: 'Fragrance FAQs', to: '/pages/faqs' },
      { label: 'Bottle Size Guide', to: '/pages/size-guide' },
      { label: 'Contact Us', to: '/pages/contact' },
    ],
  },
  {
    id: 'house',
    title: 'Our Shop',
    links: [
      { label: 'About Raheman Perfumes', to: '/pages/about' },
      { label: 'Our Perfume Makers', to: '/pages/perfumers' },
      { label: 'Perfume Guides', to: '/pages/journal' },
      { label: 'Privacy Policy', to: '/pages/privacy' },
      { label: 'Terms of Service', to: '/pages/terms' },
      { label: 'Offers & Deals', to: '/offers' },
    ],
  },
]

export const SOCIAL_LINKS = [
  { id: 'instagram', label: 'Instagram', handle: '@rahemanperfumes', icon: 'instagram', href: 'https://instagram.com/rahemanperfumes' },
  { id: 'whatsapp', label: 'WhatsApp', handle: '+91 75044 68885', icon: 'whatsapp', href: 'https://wa.me/917504468885' },
  { id: 'facebook', label: 'Facebook', handle: 'Raheman Perfumes', icon: 'facebook', href: 'https://facebook.com/rahemanperfumes' },
]

export const PAYMENT_BADGES = ['UPI', 'VISA', 'Mastercard', 'RuPay', 'Net Banking', 'COD']

/**
 * The four homepage shopping pillars. `tier` drives the flacon tint.
 *
 * A pillar may carry a `photo` instead of a flacon: the picture becomes the
 * card's ground and the card drops both the ghosted bottle and the dot grid, so
 * the two ways of dressing a pillar card are never mixed on one card.
 */
export const PILLARS = [
  {
    id: 'perfumes',
    title: 'Perfumes',
    to: '/shop',
    photo: '/pillar-originals.jpg?v=4',
  },
  {
    id: 'attars',
    title: 'Attars',
    to: '/shop/attars',
    photo: '/pillar-attars.jpg?v=4',
  },
  {
    id: 'combos',
    title: 'Combos',
    to: '/combos',
    photo: '/pillar-combos.jpg?v=4',
  },
  {
    id: 'bakhoor',
    title: 'Bakhoor',
    to: '/shop/bakhoor',
    photo: '/pillar-bakhoor.jpg?v=3',
  },
]

export const OCCASIONS = [
  { id: 'everyday', label: 'Everyday', to: '/shop/everyday', image: '/occasion-everyday.jpg' },
  { id: 'office', label: 'Office', to: '/shop/office', image: '/occasion-office.jpg' },
  { id: 'party', label: 'Party', to: '/shop/party', image: '/occasion-party.jpg' },
  { id: 'sports', label: 'Sports', to: '/shop/sports', image: '/occasion-sports.jpg' },
  { id: 'date-night', label: 'Date Night', to: '/shop/date-night', image: '/occasion-date-night.jpg' },
  { id: 'college', label: 'College', to: '/shop/college', image: '/occasion-college.jpg' },
]

export const GENDER_SEGMENTS = [
  { id: 'men', label: 'Men', to: '/shop/men', image: '/gender-men.jpg' },
  { id: 'women', label: 'Women', to: '/shop/women', image: '/gender-women.jpg' },
  { id: 'unisex', label: 'Unisex', to: '/shop/unisex', image: '/gender-unisex.jpg' },
]

export const SHOP_NOTES = [
  { id: 'oud', label: 'Oud', mood: 'Deep. Warm. Refined.', image: '/note-oud.jpg', keywords: ['oud', 'oudh', 'agarwood'] },
  { id: 'rose', label: 'Rose', mood: 'Velvety. Floral. Timeless.', image: '/note-rose.jpg', keywords: ['rose', 'damask rose', 'turkish rose', 'bulgarian rose', 'may rose'] },
  { id: 'amber', label: 'Amber', mood: 'Golden. Resinous. Rich.', image: '/note-amber.jpg', keywords: ['amber', 'ambergris', 'amberwood', 'ambroxan'] },
  { id: 'bergamot', label: 'Bergamot', mood: 'Crisp. Zesty. Uplifting.', image: '/note-bergamot.jpg', keywords: ['bergamot'] },
  { id: 'lavender', label: 'Lavender', mood: 'Fresh. Aromatic. Clean.', image: '/note-lavender.jpg', keywords: ['lavender', 'lavandin'] },
  { id: 'cardamom', label: 'Cardamom', mood: 'Aromatic. Spiced. Crisp.', image: '/note-cardamom.jpg', keywords: ['cardamom'] },
  { id: 'vanilla', label: 'Vanilla', mood: 'Warm. Sweet. Comforting.', image: '/note-vanilla.jpg', keywords: ['vanilla', 'vanille', 'bourbon vanilla'] },
  { id: 'saffron', label: 'Saffron', mood: 'Royal. Spicy. Opulent.', image: '/note-saffron.jpg', keywords: ['saffron'] },
  { id: 'vetiver', label: 'Vetiver', mood: 'Earthy. Crisp. Grounded.', image: '/note-vetiver.jpg', keywords: ['vetiver', 'khus'] },
  { id: 'jasmine', label: 'Jasmine', mood: 'Luminous. Soft. Romantic.', image: '/note-jasmine.jpg', keywords: ['jasmine', 'sambac'] },
  { id: 'citrus', label: 'Citrus', mood: 'Juicy. Vibrant. Bright.', image: '/note-citrus.jpg', keywords: ['citrus', 'orange', 'blood orange', 'mandarin', 'lemon', 'lime', 'grapefruit', 'yuzu', 'neroli', 'tangerine', 'bergamot'] },
  { id: 'cinnamon', label: 'Cinnamon', mood: 'Spiced. Warm. Festive.', image: '/note-cinnamon.jpg', keywords: ['cinnamon', 'cassia'] },
  { id: 'sandalwood', label: 'Sandalwood', mood: 'Creamy. Smooth. Woody.', image: '/note-sandalwood.jpg', keywords: ['sandalwood', 'sandal', 'mysore'] },
  { id: 'gourmand', label: 'Gourmand', mood: 'Decadent. Sweet. Addictive.', image: '/note-gourmand.jpg', keywords: ['caramel', 'praline', 'chocolate', 'cocoa', 'cacao', 'coffee', 'tonka', 'honey', 'toffee', 'almond', 'pistachio', 'sugar', 'vanilla'] },
  { id: 'spices', label: 'Spices', mood: 'Bold. Exotic. Intense.', image: '/note-spice.jpg', keywords: ['spice', 'spicy', 'pepper', 'pink pepper', 'black pepper', 'clove', 'nutmeg', 'cinnamon', 'cardamom', 'star anise', 'ginger', 'coriander'] },
  { id: 'cedarwood', label: 'Cedarwood', mood: 'Dry. Clean. Structured.', image: '/note-cedarwood.jpg', keywords: ['cedar', 'cedarwood'] },
  { id: 'floral', label: 'Floral', mood: 'Elegant. Soft. Romantic.', image: '/note-floral.jpg', keywords: ['rose', 'jasmine', 'peony', 'tuberose', 'iris', 'orris', 'lily', 'orchid', 'magnolia', 'ylang', 'neroli', 'orange blossom', 'gardenia', 'geranium', 'violet', 'freesia', 'heliotrope', 'floral'] },
  { id: 'aqua', label: 'Aqua', mood: 'Cool. Breezy. Refreshing.', image: '/note-aqua.jpg', keywords: ['aqua', 'aquatic', 'marine', 'sea', 'ocean', 'sea salt', 'water', 'ozone', 'ozonic', 'calone'] },
  { id: 'musk', label: 'Musk', mood: 'Delicate. Creamy. Sensual.', image: '/note-musk.jpg', keywords: ['musk', 'white musk', 'musky', 'cashmeran', 'ambrette'] },
  { id: 'resins', label: 'Resins', mood: 'Smoky. Sacred. Lasting.', image: '/note-resin.jpg', keywords: ['frankincense', 'olibanum', 'myrrh', 'benzoin', 'labdanum', 'incense', 'elemi', 'resin', 'bakhoor'] },
]

export const WHY_SHOP = [
  {
    id: 'authentic',
    title: '100% Authentic',
    description: 'Original branded products guaranteed',
    icon: 'shield',
    image: '/promise-authentic.jpg',
  },
  {
    id: 'quality',
    title: 'Premium Quality',
    description: 'Long lasting fragrances with French oils',
    icon: 'sparkle',
    image: '/promise-quality.jpg',
  },
  {
    id: 'hand-blended',
    title: 'Hand-Blended Oils',
    description: 'Expertly crafted with pure oils to last longer',
    icon: 'award',
    image: '/promise-custom.jpg',
  },
  {
    id: 'secure',
    title: 'Safe & Secure Payment',
    description: 'Multiple payment options & UPI enabled',
    icon: 'lock',
    image: '/promise-payment.jpg',
  },
  {
    id: 'delivery',
    title: 'Fast & Reliable Delivery',
    description: 'Delivered across all pin codes in India',
    icon: 'truck',
    image: '/promise-delivery.jpg',
  },
  {
    id: 'tamper-proof',
    title: 'Tamper-Proof Packing',
    description: 'Sealed & heat-protected transit packaging',
    icon: 'shield',
    image: '/promise-authentic.jpg',
  },
]

export const INSTAGRAM_POSTS = [
  { id: 'ig-1', caption: '#UnboxingRaheman', handle: '@rahemanperfumes', likes: 1240 },
  { id: 'ig-2', caption: '#SignatureScent', handle: '@rahemanperfumes', likes: 892 },
  { id: 'ig-3', caption: '#FrenchOils', handle: '@rahemanperfumes', likes: 1567 },
  { id: 'ig-4', caption: '#ScentOfTheDay', handle: '@rahemanperfumes', likes: 2103 },
  { id: 'ig-5', caption: '#LuxuryBottle', handle: '@rahemanperfumes', likes: 1108 },
  { id: 'ig-6', caption: '#OudCollection', handle: '@rahemanperfumes', likes: 1732 },
]

/** Delivery methods offered at checkout. */
export const SHIPPING_METHODS = [
  {
    id: 'standard',
    name: 'Standard Courier Delivery',
    description: 'Safe delivery with tamper-proof protective packing.',
    carrier: 'Standard Delivery / Blue Dart Surface',
    price: 0,
    eta: '4–6 working days',
    tag: 'STANDARD',
  },
  {
    id: 'express',
    name: 'Fast Air Delivery',
    description: 'Fast 1–2 day air delivery with extra safe packing.',
    carrier: 'Bluedart Apex Express',
    price: 99,
    eta: '1–2 working days',
    tag: 'Priority',
  },
]

/** Payment methods offered at checkout. */
export const PAYMENT_METHODS = [
  { id: 'razorpay', label: 'Online Payment (Razorpay)', note: 'UPI / Cards / Net Banking / Wallets', badge: 'Instant', fee: 0 },
  { id: 'cod', label: 'Cash on Delivery', note: 'Pay at doorstep', badge: '₹49 handling', fee: 49 },
]

/** Homepage FAQ teasers. */
export const HOME_FAQ = [
  {
    id: 'authentic',
    question: 'How do I know the original perfumes are genuine?',
    answer:
      'We buy directly from official distributors \u2014 never from resellers \u2014 and each order ships with a Raheman Perfumes authenticity seal.',
  },
  {
    id: 'inspired',
    question: 'What exactly is an "inspired" fragrance?',
    answer:
      'An inspired fragrance is our perfumers’ own version of a famous scent, made from pure French oils at up to 40% oil concentration. It is not a copy or a refill of the original — it is a new blend that smells very close to the one you already love, at a much lower price.',
  },
  {
    id: 'longevity',
    question: 'How long do the fragrances last?',
    answer:
      'Our inspired and mixing perfumes are blended with up to 40% oil concentration and last 10–12 hours on skin, longer on clothes. Original branded perfumes last as long as the brand says — we list the details on each product page.',
  },
  {
    id: 'shipping',
    question: 'Do you deliver across India?',
    answer:
      'Yes — we deliver to every serviceable pin code in India. Standard delivery rates and complimentary free delivery options are applied live at checkout based on current store settings. Express air delivery is also available. Perfumes travel safely in 3-layer protective bubble packaging with a tamper-proof seal.',
  },
  {
    id: 'return-policy',
    question: 'What is your return and exchange policy?',
    answer:
      'All sales are strictly final. We follow a firm No Return, No Exchange, and No Replacement Policy once an order is packed or delivered.',
  },
]

export const NEWSLETTER = {
  title: 'Join Our Email List',
  description:
    'Get early access to new perfumes, exclusive offers, and fragrance notes from our team.',
  placeholder: 'Enter your email address',
  cta: 'Subscribe',
}

export const HOUSE_BLURB =
  'Hand-blending fine perfumes from rare oils and traditional Indian methods.'

export const COPYRIGHT = '© 2026 RAHEMAN PERFUMES. All rights reserved. Registered trademark.'
export const TAGLINE = 'Hand-blended with \u2665 for perfume lovers across India.'

export default MAIN_NAV
