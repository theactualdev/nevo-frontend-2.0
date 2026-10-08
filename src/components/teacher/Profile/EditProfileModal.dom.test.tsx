import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditProfileModal } from "./EditProfileModal";
import type { TeacherProfile } from "@/lib/mocks/teacherProfile";

/**
 * C11's "Change photo", which was a button with no handler until 18 Sep.
 *
 * The upload belongs to the screen above, so what is guarded here is what a
 * teacher experiences: that the control is absent when there is no account to
 * put a photo on, that the disc shows the new photo as soon as it lands, and
 * that a failed upload says the old photo is still there - because the only
 * thing worse than a failed upload is one that looks like it worked.
 */

const PROFILE = {
  name: "Amina Bello",
  initials: "AB",
  email: "amina@school.test",
  subjects: "Mathematics",
  school: "Corona Secondary",
} as unknown as TeacherProfile;

const file = () =>
  new File(["binary"], "me.png", { type: "image/png" });

const pick = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, { target: { files: [file()] } });
  return input as HTMLInputElement;
};

const photo = () => screen.queryByRole("presentation", { hidden: true });

describe("changing the photo", () => {
  it("offers no control when nothing can take the file", () => {
    render(
      <EditProfileModal profile={PROFILE} onCancel={vi.fn()} onSave={vi.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: "Change photo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("sends the file the teacher picked and shows what came back", async () => {
    const onPhotoPicked = vi.fn().mockResolvedValue("https://example.test/new.jpg");
    render(
      <EditProfileModal
        profile={PROFILE}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPhotoPicked={onPhotoPicked}
      />,
    );

    expect(screen.getByText("AB")).toBeInTheDocument();
    pick();

    await waitFor(() =>
      expect(photo()).toHaveAttribute("src", "https://example.test/new.jpg"),
    );
    expect(onPhotoPicked).toHaveBeenCalledWith(expect.any(File));
    expect(screen.queryByText("AB")).not.toBeInTheDocument();
  });

  it("shows the photo already on the account", () => {
    render(
      <EditProfileModal
        profile={PROFILE}
        photoUrl="https://example.test/old.jpg"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPhotoPicked={vi.fn()}
      />,
    );

    expect(photo()).toHaveAttribute("src", "https://example.test/old.jpg");
  });

  it("says the old photo is still there when the upload failed", async () => {
    const onPhotoPicked = vi.fn().mockResolvedValue(null);
    render(
      <EditProfileModal
        profile={PROFILE}
        photoUrl="https://example.test/old.jpg"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPhotoPicked={onPhotoPicked}
      />,
    );

    pick();

    expect(
      await screen.findByText(/your old one is still there/),
    ).toBeInTheDocument();
    expect(photo()).toHaveAttribute("src", "https://example.test/old.jpg");
  });

  it("says so while it is sending, and refuses a second file until it lands", async () => {
    let land: (v: string | null) => void = () => {};
    const onPhotoPicked = vi.fn(
      () => new Promise<string | null>((r) => (land = r)),
    );
    render(
      <EditProfileModal
        profile={PROFILE}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPhotoPicked={onPhotoPicked}
      />,
    );

    pick();
    await screen.findByRole("button", { name: "Sending…" });
    pick();

    expect(onPhotoPicked).toHaveBeenCalledTimes(1);
    await waitFor(() => land("https://example.test/new.jpg"));
  });

  it("takes a second photo after the first one lands", async () => {
    /*
     * WHAT THIS DOES NOT PROVE. The component also clears the input's value
     * so that re-picking the SAME filename fires a change at all, and a
     * mutation run showed that deleting that line fails nothing here: jsdom
     * never sets `value` from a change event carrying files, and refuses to
     * let a test set one. The line is commented in the component instead of
     * being claimed as covered.
     *
     * What is proved is that the busy guard releases - that a teacher is not
     * locked out of a second attempt by state left behind from the first.
     */
    const onPhotoPicked = vi.fn().mockResolvedValue("https://example.test/a.jpg");
    render(
      <EditProfileModal
        profile={PROFILE}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPhotoPicked={onPhotoPicked}
      />,
    );

    pick();
    await waitFor(() => expect(onPhotoPicked).toHaveBeenCalledTimes(1));

    pick();
    await waitFor(() => expect(onPhotoPicked).toHaveBeenCalledTimes(2));
  });
});

describe("saving (C20)", () => {
  it("saves from Enter in a field, through the form its button submits", () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<EditProfileModal profile={PROFILE} onCancel={vi.fn()} onSave={onSave} />);
    const name = screen.getByLabelText("Full name") as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;

    expect(save.type).toBe("submit");
    expect(save.form).toBe(name.form);
    // Handled here, so the browser does not reload the page as well.
    expect(fireEvent.submit(name.form!)).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not let Cancel submit it", () => {
    render(<EditProfileModal profile={PROFILE} onCancel={vi.fn()} onSave={vi.fn()} />);

    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).type).toBe("button");
  });
});
