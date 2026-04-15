export interface IconCatalogEntry {
  name: string;
  keywords?: string;
}

export interface IconCategory {
  id: string;
  labelKey: string;
  icons: IconCatalogEntry[];
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    id: 'navigation',
    labelKey: 'iconPicker.catNavigation',
    icons: [
      { name: 'Home' }, { name: 'Menu' }, { name: 'Close' },
      { name: 'ArrowBack' }, { name: 'ArrowForward' }, { name: 'ArrowUpward' }, { name: 'ArrowDownward' },
      { name: 'ExpandMore' }, { name: 'ExpandLess' }, { name: 'ChevronLeft' }, { name: 'ChevronRight' },
      { name: 'KeyboardArrowDown' }, { name: 'KeyboardArrowUp' },
      { name: 'MoreVert' }, { name: 'MoreHoriz' }, { name: 'Apps' },
    ],
  },
  {
    id: 'actions',
    labelKey: 'iconPicker.catActions',
    icons: [
      { name: 'Add' }, { name: 'AddCircle' }, { name: 'AddCircleOutline' },
      { name: 'Edit' }, { name: 'EditNote' }, { name: 'Delete' }, { name: 'DeleteOutline' },
      { name: 'Check' }, { name: 'CheckCircle' }, { name: 'CheckCircleOutline' },
      { name: 'Cancel' }, { name: 'Save' }, { name: 'Search' }, { name: 'FilterList' }, { name: 'FilterAlt' },
      { name: 'Sort' }, { name: 'Refresh' }, { name: 'Download' }, { name: 'Upload' }, { name: 'CloudUpload' },
      { name: 'CloudDownload' }, { name: 'Send' }, { name: 'ContentCopy' }, { name: 'Print' }, { name: 'Share' },
      { name: 'Logout' }, { name: 'Login' }, { name: 'PlayArrow' }, { name: 'Pause' }, { name: 'Stop' },
    ],
  },
  {
    id: 'content',
    labelKey: 'iconPicker.catContent',
    icons: [
      { name: 'CalendarMonth' }, { name: 'CalendarToday' }, { name: 'Event' }, { name: 'Schedule' },
      { name: 'AccessTime' }, { name: 'Today' }, { name: 'DateRange' },
      { name: 'Person' }, { name: 'PersonOutline' }, { name: 'People' }, { name: 'Group' }, { name: 'Groups' },
      { name: 'AccountCircle' }, { name: 'Badge' },
      { name: 'Email' }, { name: 'MailOutline' }, { name: 'Phone' }, { name: 'Message' }, { name: 'Chat' },
      { name: 'Star' }, { name: 'StarBorder' }, { name: 'StarHalf' },
      { name: 'LocationOn' }, { name: 'LocationCity' }, { name: 'Place' }, { name: 'Map' }, { name: 'MyLocation' },
      { name: 'Image' }, { name: 'ImageOutlined' }, { name: 'Photo' }, { name: 'PhotoCamera' },
      { name: 'AttachFile' }, { name: 'Description' }, { name: 'Article' }, { name: 'InsertDriveFile' },
      { name: 'Link' }, { name: 'Label' }, { name: 'Bookmark' }, { name: 'BookmarkBorder' },
    ],
  },
  {
    id: 'status',
    labelKey: 'iconPicker.catStatus',
    icons: [
      { name: 'CheckCircle' }, { name: 'WarningAmber' }, { name: 'Warning' }, { name: 'Error' }, { name: 'ErrorOutline' },
      { name: 'Info' }, { name: 'InfoOutlined' }, { name: 'Notifications' }, { name: 'NotificationsNone' },
      { name: 'Verified' }, { name: 'VerifiedUser' }, { name: 'Help' }, { name: 'HelpOutline' },
      { name: 'HourglassEmpty' }, { name: 'Pending' }, { name: 'DoneAll' }, { name: 'Block' },
    ],
  },
  {
    id: 'commerce',
    labelKey: 'iconPicker.catCommerce',
    icons: [
      { name: 'ShoppingCart' }, { name: 'ShoppingCartOutlined' }, { name: 'ShoppingBag' }, { name: 'ShoppingBasket' },
      { name: 'Payment' }, { name: 'CreditCard' }, { name: 'AccountBalanceWallet' }, { name: 'AttachMoney' },
      { name: 'Receipt' }, { name: 'ReceiptLong' }, { name: 'LocalShipping' }, { name: 'LocalOffer' },
      { name: 'Store' }, { name: 'Storefront' }, { name: 'Inventory' }, { name: 'Inventory2' },
      { name: 'Sell' }, { name: 'Discount' }, { name: 'LocalMall' }, { name: 'MonetizationOn' },
    ],
  },
  {
    id: 'social',
    labelKey: 'iconPicker.catSocial',
    icons: [
      { name: 'Favorite' }, { name: 'FavoriteBorder' }, { name: 'ThumbUp' }, { name: 'ThumbDown' },
      { name: 'ThumbUpOffAlt' }, { name: 'Comment' }, { name: 'Forum' }, { name: 'QuestionAnswer' },
      { name: 'Share' }, { name: 'Reply' }, { name: 'Send' }, { name: 'Chat' }, { name: 'ChatBubble' },
    ],
  },
  {
    id: 'food',
    labelKey: 'iconPicker.catFood',
    icons: [
      { name: 'Restaurant' }, { name: 'RestaurantMenu' }, { name: 'LocalDining' }, { name: 'LocalPizza' },
      { name: 'LocalCafe' }, { name: 'LocalBar' }, { name: 'LocalDrink' }, { name: 'Fastfood' },
      { name: 'Cake' }, { name: 'Icecream' }, { name: 'LunchDining' }, { name: 'DinnerDining' },
      { name: 'BreakfastDining' }, { name: 'BakeryDining' }, { name: 'Coffee' }, { name: 'EmojiFoodBeverage' },
      { name: 'SetMeal' }, { name: 'Kitchen' }, { name: 'OutdoorGrill' },
    ],
  },
  {
    id: 'beauty',
    labelKey: 'iconPicker.catBeauty',
    icons: [
      { name: 'Spa' }, { name: 'ContentCut' }, { name: 'Face' }, { name: 'Face3' }, { name: 'Face4' },
      { name: 'Brush' }, { name: 'Palette' }, { name: 'Colorize' }, { name: 'FormatPaint' },
      { name: 'AutoAwesome' }, { name: 'Diamond' }, { name: 'EmojiEvents' },
    ],
  },
  {
    id: 'services',
    labelKey: 'iconPicker.catServices',
    icons: [
      { name: 'Build' }, { name: 'Construction' }, { name: 'Handyman' }, { name: 'HomeRepairService' },
      { name: 'CleaningServices' }, { name: 'LocalLaundryService' }, { name: 'DryCleaning' },
      { name: 'Plumbing' }, { name: 'ElectricalServices' }, { name: 'Pets' }, { name: 'LocalHospital' },
      { name: 'MedicalServices' }, { name: 'LocalPharmacy' }, { name: 'Psychology' }, { name: 'FitnessCenter' },
      { name: 'SportsTennis' }, { name: 'Pool' }, { name: 'SelfImprovement' }, { name: 'DirectionsCar' },
      { name: 'DirectionsBus' }, { name: 'Flight' }, { name: 'Hotel' }, { name: 'Luggage' },
    ],
  },
  {
    id: 'misc',
    labelKey: 'iconPicker.catMisc',
    icons: [
      { name: 'Settings' }, { name: 'SettingsOutlined' }, { name: 'Dashboard' }, { name: 'DashboardOutlined' },
      { name: 'BarChart' }, { name: 'PieChart' }, { name: 'TrendingUp' }, { name: 'TrendingDown' }, { name: 'Insights' },
      { name: 'Visibility' }, { name: 'VisibilityOff' }, { name: 'Lock' }, { name: 'LockOpen' }, { name: 'LockOutlined' },
      { name: 'Language' }, { name: 'Translate' }, { name: 'Public' },
      { name: 'DarkMode' }, { name: 'LightMode' }, { name: 'WbSunny' }, { name: 'NightsStay' },
      { name: 'Business' }, { name: 'Work' }, { name: 'School' }, { name: 'Book' }, { name: 'MenuBook' },
      { name: 'Home' }, { name: 'House' }, { name: 'Apartment' }, { name: 'MeetingRoom' },
      { name: 'Celebration' }, { name: 'CardGiftcard' }, { name: 'Redeem' }, { name: 'Loyalty' },
      { name: 'RocketLaunch' }, { name: 'Bolt' }, { name: 'FlashOn' }, { name: 'EmojiObjects' },
    ],
  },
];

export const ALL_ICONS: IconCatalogEntry[] = ICON_CATEGORIES.flatMap((c) => c.icons);

/** Deduplicated icon-name list for lookup (some names appear in multiple categories). */
export const ICON_NAMES: string[] = Array.from(new Set(ALL_ICONS.map((i) => i.name)));
