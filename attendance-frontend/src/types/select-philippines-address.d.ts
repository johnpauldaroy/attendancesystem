declare module 'select-philippines-address' {
  export interface RegionAddress {
    id: number;
    psgc_code: string;
    region_name: string;
    region_code: string;
  }

  export interface ProvinceAddress {
    psgc_code: string;
    province_name: string;
    province_code: string;
    region_code: string;
  }

  export interface CityAddress {
    city_name: string;
    city_code: string;
    province_code: string;
    region_desc: string;
  }

  export interface BarangayAddress {
    brgy_name: string;
    brgy_code: string;
    province_code: string;
    region_code: string;
  }

  export function regions(): Promise<RegionAddress[] | string>;
  export function regionByCode(code: string): Promise<RegionAddress | string | undefined>;
  export function provinces(code: string): Promise<ProvinceAddress[] | string>;
  export function provincesByCode(code: string): Promise<ProvinceAddress[] | string>;
  export function provinceByName(name: string): Promise<ProvinceAddress | string | undefined>;
  export function cities(code: string): Promise<CityAddress[] | string>;
  export function barangays(code: string): Promise<BarangayAddress[] | string>;
}
