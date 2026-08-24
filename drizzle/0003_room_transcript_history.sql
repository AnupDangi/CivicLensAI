ALTER TABLE "transcript_segments" ADD COLUMN "external_id" varchar(160);
CREATE UNIQUE INDEX "transcript_room_segment_uq" ON "transcript_segments" USING btree ("room_id","external_id");
