/**
 * One definition of "which schema.org types describe the business itself", shared by the
 * site scan (which picks the entity node) and the scoring (which awards schema points), so
 * the two can never disagree about whether a page carries business structured data.
 */

export const LOCAL_BUSINESS_TYPES: ReadonlySet<string> = new Set([
  "LocalBusiness", "AnimalShelter", "ArchiveOrganization", "AutomotiveBusiness", "AutoBodyShop", "AutoDealer",
  "AutoPartsStore", "AutoRental", "AutoRepair", "AutoWash", "GasStation", "MotorcycleDealer", "MotorcycleRepair",
  "ChildCare", "Dentist", "DryCleaningOrLaundry", "EmergencyService", "FireStation", "Hospital", "PoliceStation",
  "EmploymentAgency", "EntertainmentBusiness", "AdultEntertainment", "AmusementPark", "ArtGallery", "Casino",
  "ComedyClub", "MovieTheater", "NightClub", "FinancialService", "AccountingService", "AutomatedTeller",
  "BankOrCreditUnion", "InsuranceAgency", "FoodEstablishment", "Bakery", "BarOrPub", "Brewery", "CafeOrCoffeeShop",
  "Distillery", "FastFoodRestaurant", "IceCreamShop", "Restaurant", "Winery", "GovernmentOffice", "PostOffice",
  "HealthAndBeautyBusiness", "BeautySalon", "DaySpa", "HairSalon", "HealthClub", "NailSalon", "TattooParlor",
  "HomeAndConstructionBusiness", "Electrician", "GeneralContractor", "HVACBusiness", "HousePainter", "Locksmith",
  "MovingCompany", "Plumber", "RoofingContractor", "InternetCafe", "LegalService", "Attorney", "Notary", "Library",
  "LodgingBusiness", "BedAndBreakfast", "Campground", "Hostel", "Hotel", "Motel", "Resort", "VacationRental",
  "MedicalBusiness", "CommunityHealth", "Dermatology", "DietNutrition", "Emergency", "Geriatric", "Gynecologic",
  "MedicalClinic", "Midwifery", "Nursing", "Obstetric", "Oncologic", "Optician", "Optometric", "Otolaryngologic",
  "Pediatric", "Pharmacy", "Physician", "Physiotherapy", "PlasticSurgery", "Podiatric", "PrimaryCare", "Psychiatric",
  "PublicHealth", "VeterinaryCare", "ProfessionalService", "RadioStation", "RealEstateAgent", "RecyclingCenter",
  "SelfStorage", "ShoppingCenter", "SportsActivityLocation", "BowlingAlley", "ExerciseGym", "GolfCourse",
  "PublicSwimmingPool", "SkiResort", "SportsClub", "StadiumOrArena", "TennisComplex", "Store", "BikeStore",
  "BookStore", "ClothingStore", "ComputerStore", "ConvenienceStore", "DepartmentStore", "ElectronicsStore", "Florist",
  "FurnitureStore", "GardenStore", "GroceryStore", "HardwareStore", "HobbyShop", "HomeGoodsStore", "JewelryStore",
  "LiquorStore", "MensClothingStore", "MobilePhoneStore", "MovieRentalStore", "MusicStore", "OfficeEquipmentStore",
  "OutletStore", "PawnShop", "PetStore", "ShoeStore", "SportingGoodsStore", "TireShop", "ToyStore", "WholesaleStore",
  "TelevisionStation", "TouristInformationCenter", "TravelAgency", "Organization", "Corporation", "MedicalOrganization",
  "EducationalOrganization", "School", "SportsOrganization",
]);

/** Catches subtypes and custom types the list does not enumerate (e.g. "MartialArtsDojo", "Physician"). */
const ENTITY_TYPE_PATTERN =
  /Business|Organization|Store|Shop|Service|Restaurant|Dentist|Clinic|Salon|Agency|Contractor|Hotel|School|Studio|Dojo|Physician|Attorney|Plumber|Electrician/;

/** True when a schema.org @type names the business entity rather than a page, article, product or person. */
export function isEntityType(type: string): boolean {
  const t = type.trim().replace(/^https?:\/\/schema\.org\//i, "");
  return LOCAL_BUSINESS_TYPES.has(t) || ENTITY_TYPE_PATTERN.test(t);
}
