-- Event names follow the app's wording: theses are "LP ideas".
UPDATE "events" SET "name" = replace("name", 'thesis_', 'lp_idea_'), "props" = CASE WHEN "props" ? 'thesisId' THEN ("props" - 'thesisId') || jsonb_build_object('lpIdeaId', "props"->'thesisId') ELSE "props" END WHERE "name" LIKE 'thesis\_%';
