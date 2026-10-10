// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RecordPicker, type PickerColumn } from "../src/components/RecordPicker";

type Customer = { id: string; code: string; name: string };
const customers: Customer[] = [{ id: "a", code: "305-A0001", name: "AURORA PLUS SDN BHD" }, { id: "p", code: "305-P0001", name: "POWERLIFE (M) SDN. BHD." }, { id: "m", code: "305-M0001", name: "MAPLE LEAF ORGANIC" }];
const columns: PickerColumn<Customer>[] = [{ key: "code", label: "Customer ID", value: (item) => item.code, filter: true }, { key: "name", label: "Customer name", value: (item) => item.name, filter: true }];
const picker = (onChange = vi.fn()) => {
  const view = render(<RecordPicker label="Customer ID" name="customerId" noun="customer" records={customers} columns={columns} display={(item) => item.code} placeholder="" onChange={onChange} />);
  return { view, onChange, field: view.getByRole("combobox") };
};
afterEach(cleanup);

describe("record picker", () => {
  it("keeps the record whose code was typed in full when Enter is pressed", () => {
    const { field, onChange } = picker();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "305-P0001" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("p");
    expect((field as HTMLInputElement).value).toBe("305-P0001");
  });
  it("searches every column from the field and narrows by each column's filter", () => {
    const { field, view, onChange } = picker();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "maple" } });
    expect(view.getAllByRole("option").map((row) => row.textContent)).toEqual(["305-M0001MAPLE LEAF ORGANIC"]);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.change(view.getByLabelText("Filter by customer name"), { target: { value: "sdn" } });
    expect(view.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(view.getAllByRole("option")[1]);
    expect(onChange).toHaveBeenLastCalledWith("p");
  });
  it("will not submit with text that is not a listed record", () => {
    const { field } = picker();
    fireEvent.change(field, { target: { value: "305-N0014" } });
    expect((field as HTMLInputElement).validationMessage).toBe("Choose a customer from the list.");
  });
});
