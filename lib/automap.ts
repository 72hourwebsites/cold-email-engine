import { FieldMapping } from "./types";
import { applyOutscraperPreset, isOutscraperCsv } from "./outscraper";
import { applyLeadRocksPreset, isLeadRocksCsv } from "./leadrocks";

const KEYWORD_MAP: Record<string, string[]> = {
  firstName:       ["first_name","firstname","first name","fname","given_name"],
  lastName:        ["last_name","lastname","last name","lname","surname"],
  fullName:        ["full_name","fullname","full name","contact_name","contact name"],
  ownerName:       ["owner_name","owner","whitepages_phones.name","contact_person"],
  company:         ["name_for_emails","company","company_name","organization","business","account"],
  jobTitle:        ["job_title","jobtitle","title","position","role","designation"],
  industry:        ["type","industry","vertical","sector","category","business_type"],
  subtypes:        ["subtypes","sub_types","sub_type"],
  city:            ["city","town","municipality"],
  state:           ["state_code","state","province","region"],
  country:         ["country","nation"],
  email:           ["email","email_address","e_mail","mail"],
  phone:           ["phone","phone_number","mobile","cell","tel"],
  website:         ["website","url","web","domain","site"],
  rating:          ["rating","score","stars","star_rating"],
  reviews:         ["reviews","review_count","total_reviews","num_reviews"],
  reviewsTop:      ["reviews_per_score_5","five_star","fivestar","5star"],
  reviewsBottom:   ["reviews_per_score_1","one_star","onestar","1star"],
  hours:           ["working_hours_csv_compatible","hours","working_hours","business_hours"],
  happyHours:      ["other_hours","happy_hours","happyhours"],
  reservationLinks:["reservation_links","booking_link","reservation_url"],
  attributes:      ["about","attributes","google_attributes"],
  priceRange:      ["range","price_range","price","pricing"],
  foundedYear:     ["company_insights.founded_year","founded_year","founded","year_founded","established"],
  revenue:         ["company_insights.revenue","revenue","annual_revenue","estimated_revenue"],
  linkedinBio:     ["description","linkedin_bio","bio","summary","about_us","company_insights.description"],
  linkedinUrl:     ["linkedin","linkedin_url","linkedin_company_page","linkedin_profile"],
  localHook:       ["hook","local_hook","trigger","news","local_news","icebreaker","personalization"],
  cuisine:         ["cuisine","food_type","niche"],
  custom1:         ["custom1","name","legal_name"],
  custom2:         ["custom2","company_insights.linkedin_bio","linkedin_bio"],
  custom3:         ["custom3","company_insights.employees","employees"],
};

export function autoMapColumns(csvColumns: string[]): FieldMapping[] {
  // LeadRocks format — check first (most specific)
  if (isLeadRocksCsv(csvColumns)) {
    return applyLeadRocksPreset(csvColumns);
  }
  // Outscraper format
  if (isOutscraperCsv(csvColumns)) {
    return applyOutscraperPreset(csvColumns);
  }

  // Standard keyword-based automapping
  const usedKeys = new Set<string>();
  return csvColumns.map(col => {
    const normalized = col.toLowerCase().replace(/[\s\-]/g, "_");
    let matched = "";

    for (const [key, keywords] of Object.entries(KEYWORD_MAP)) {
      if (usedKeys.has(key)) continue;
      if (keywords.some(kw => {
        const kwNorm = kw.replace(/[\s\-]/g, "_");
        return normalized === kwNorm || normalized.includes(kwNorm) || kwNorm.includes(normalized);
      })) {
        matched = key;
        break;
      }
    }

    if (matched) usedKeys.add(matched);
    return { csvColumn: col, semanticKey: matched };
  });
}
