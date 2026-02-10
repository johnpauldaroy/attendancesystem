// Represents one row from the member import/export template.
export interface MemberTemplateRow {
  cifKey: string;
  memberName: string;
  birthDate: string;            // YYYY-MM-DD
  age: number | string;
  address: string;
  telephoneNo: string;
  contactNo: string;
  sex: string;
  civilStatus: string;
  dateOfMembership: string;     // YYYY-MM-DD
  classification: string;
  membershipType: string;
  status: string;
  position: string;
  annualIncome: string;
  tin: string;
  sss: string;
  spouseName: string;
  educAttainment: string;
  unitHouseNumberStreet: string;
  barangayVillage: string;
  cityTownMunicipality: string;
  province: string;
  gsis: string;
  membershipStatus: string;
  segmentationStatus: string;
  representativeStatus: string;
  attendanceStatus: string;
  originBranch: string;
}
