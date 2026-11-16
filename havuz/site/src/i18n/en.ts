/**
 * İngilizce arayüz sözlüğü. Biçimi tr.ts ile bire bir aynı olmak zorundadır (tür denetimi zorlar).
 * Kim kullanır: src/i18n/index.ts.
 * Genişletme: tr.ts'e eklenen her anahtarı buraya da ekleyin; yeni bir dil için bu dosyayı kopyalayın (AGENTS.md → "Yeni dil").
 */
import type { Dictionary } from './tr.ts'

export const en: Dictionary = {
  a11y: {
    skipToContent: 'Skip to content',
    mainNav: 'Main menu',
    footerNav: 'Footer links',
    legalNav: 'Legal links',
    breadcrumbs: 'Breadcrumb',
    pagination: 'Pages',
    social: 'Social accounts',
    homeLink: '{site} home page',
  },
  header: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    search: 'Search',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  language: {
    label: 'Language',
  },
  search: {
    title: 'Search the site',
    placeholder: 'What are you looking for?',
    hint: 'Type at least two letters to search.',
    loading: 'Searching…',
    noResults: 'No results for “{query}”.',
    resultsOne: '1 result found.',
    resultsMany: '{count} results found.',
    unavailable: 'The search index only exists in the built site. To try it: npm run build, then npm run preview.',
    close: 'Close search',
  },
  home: {
    sections: {
      features: 'features',
      steps: 'how-it-works',
      testimonials: 'testimonials',
      pricing: 'pricing',
      faq: 'faq',
    },
    popularPlan: 'Most popular',
    mockupLabel: 'Sample screen: today’s appointment list',
  },
  blog: {
    title: 'Blog',
    description: 'Short, practical articles on websites, visibility and customer communication for small businesses.',
    readingTime: '{minutes} min read',
    updated: 'Updated: {date}',
    tagsLabel: 'Tags',
    tagTitle: 'Posts tagged “{tag}”',
    tagDescription: 'Every blog post we have published with the “{tag}” tag on one page: {count} in total, newest first.',
    allPosts: 'All posts',
    related: 'Related posts',
    pageTitle: 'Blog — Page {page}',
    readPost: 'Read the post',
    author: 'Written by',
    feedTitle: '{site} Blog',
  },
  docs: {
    title: 'Docs',
    description:
      'The user guide for this site foundation: adding content, changing the menu and colours, wiring the form and publishing.',
    menu: 'Docs menu',
    onThisPage: 'On this page',
    previous: 'Previous',
    next: 'Next',
    pager: 'Previous and next document',
    startHere: 'Start here',
  },
  pagination: {
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page}',
  },
  contact: {
    title: 'Contact',
    description:
      'Send us your question, suggestion or trial request; we usually reply within one business day. You can also email us directly.',
    lead: 'Write to us; we usually reply within one business day.',
    infoTitle: 'Reach us',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    form: {
      title: 'Send a message',
      name: 'Your name',
      email: 'Your email address',
      message: 'Your message',
      messageHint: 'The more detail you give, the better we can help.',
      trap: 'Leave this field empty',
      submit: 'Send',
      sending: 'Sending…',
      success: 'Thank you, your message has reached us. We will reply as soon as we can.',
      failure: 'The message could not be sent. Please try again or email us directly: {email}',
      mailto: 'Your email app has opened; you can send the message from there. If it did not, write to: {email}',
      tooFast: 'The form was submitted too quickly. Please try again in a few seconds.',
      summary: 'Please fix the highlighted fields.',
      required: 'Fill in this field.',
      invalidEmail: 'Enter a valid email address (name@example.com).',
      tooShort: 'Enter at least {min} characters.',
      tooLong: 'You can enter at most {max} characters.',
      mailSubject: '{site} contact form: {name}',
    },
  },
  newsletter: {
    title: 'Get new posts by email',
    description: 'One email a month. Unsubscribe with a single click at any time.',
    email: 'Your email address',
    submit: 'Subscribe',
    sending: 'Saving…',
    success: 'You are subscribed, thank you.',
    failure: 'We could not save your subscription. Please try again shortly.',
    invalidEmail: 'Enter a valid email address.',
  },
  notFound: {
    title: 'Page not found',
    description: 'The page you are looking for may have moved or never existed. You can continue from the home page.',
    home: 'Back to home',
    blog: 'Browse the blog',
  },
  footer: {
    rights: 'All rights reserved.',
  },
  callout: {
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    caution: 'Caution',
  },
  code: {
    copy: 'Copy',
    copied: 'Copied',
  },
  table: {
    label: 'Table',
  },
  footnotes: {
    label: 'Footnotes',
    back: 'Back to text',
  },
  legal: {
    templateTitle: 'This text is a template',
    templateNotice:
      'This page is a sample template, not legal advice. Adapt it to how you actually operate and have a lawyer review it before publishing.',
    lastUpdated: 'Last updated: {date}',
  },
  announcement: {
    label: 'Announcement',
    dismiss: 'Dismiss announcement',
  },
}
