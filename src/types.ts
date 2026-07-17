export type EntityType = 'person' | 'place' | 'event' | 'epoch';
export type Sex = 'male' | 'female' | 'other' | 'unknown';
export type Connotation = 'positive' | 'negative' | 'neutral' | 'unknown';

export interface User {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: User;
}

export interface ProfileActivity {
  entity_type: EntityType;
  entity_id: number;
  title: string;
  action: 'created' | 'updated';
  occurred_at: string;
}

export interface Profile {
  user: User;
  recent_activity: ProfileActivity[];
}

export interface Editable {
  id: number;
  rarity: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Person extends Editable {
  alias: string;
  name?: string | null;
  surname?: string | null;
  sex: Sex;
  connotation: Connotation;
  description?: string | null;
}

export interface Place extends Editable {
  name: string;
  description?: string | null;
}

export interface Epoch extends Editable {
  name: string;
  description?: string | null;
}

export interface Event extends Editable {
  epoch_id: number;
  place_id: number;
  title: string;
  description?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  place?: Place | null;
  epoch?: Epoch | null;
}

export interface SearchResult {
  entity_type: EntityType;
  id: number;
  title: string;
  subtitle?: string | null;
}

export interface PullResult {
  entity_type: EntityType;
  id: number;
  title: string;
  rarity: number;
  mode: 'random' | 'daily';
}

export interface EventParticipant {
  person_id: number;
  event_id: number;
  role: string | null;
  motivation?: string | null;
  person?: Person | null;
}

export interface EventParticipantInput {
  person_id: number;
  role?: string | null;
  motivation?: string | null;
}

export interface PersonEvent {
  person_id: number;
  event_id: number;
  role: string | null;
  motivation?: string | null;
  event?: Event | null;
}

export interface PersonPlace {
  person_id: number;
  place_id: number;
  motivation?: string | null;
  place?: Place | null;
}

export interface PlacePerson {
  person_id: number;
  place_id: number;
  motivation?: string | null;
  person?: Person | null;
}

export interface MediaAsset {
  id: number;
  pullable_id: number;
  filename: string;
  content_type: string;
  created_at: string;
}
