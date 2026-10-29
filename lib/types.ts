export type Car = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  photo_url: string | null;
  created_at: string;
};

export type CarPhoto = {
  id: string;
  car_id: string;
  user_id: string;
  angle: "front_34" | "front" | "side" | "rear_34" | "rear";
  storage_path: string;
  created_at: string;
};
